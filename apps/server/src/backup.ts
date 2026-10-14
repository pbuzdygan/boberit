import { randomUUID } from 'node:crypto';
import { maxUploadBytes, storedFileTypes } from './uploads.js';
import type { StorageArea } from './storage.js';

type Row = Record<string, unknown>;
type Value = string | number | null;

export class BackupError extends Error {}

export interface PreparedRestore {
  tables: Record<string, Record<string, Value>[]>;
  files: { area: StorageArea; storedName: string; data: Buffer }[];
}

// Each column a package may set. Anything not listed is dropped; household_id is always set by the server,
// byte_size is measured from the attachment, and an empty optional value falls back to the column default.
type Field =
  | { type: 'id' }
  | { type: 'ref'; table: string; required?: boolean; kind?: 'category' | 'location' }
  | { type: 'text'; required?: boolean; max?: number }
  | { type: 'int'; required?: boolean; min?: number; max?: number }
  | { type: 'enum'; values: readonly string[]; required?: boolean }
  | { type: 'file' };

const text = (required = false, max = 100_000): Field => ({ type: 'text', required, max });
const timestamp: Field = { type: 'text', required: true, max: 64 };
const optionalTimestamp: Field = { type: 'text', max: 64 };
const fileColumns: Record<string, Field> = {
  original_name: text(true, 200),
  stored_name: { type: 'file' },
  mime_type: { type: 'text', required: true, max: 200 },
  created_at: timestamp,
};

// Parents come before children, so every reference can be resolved against the package itself.
const tables: [string, Record<string, Field>][] = [
  [
    'asset_options',
    {
      id: { type: 'id' },
      kind: { type: 'enum', values: ['category', 'location'], required: true },
      name: text(true, 80),
      created_at: timestamp,
    },
  ],
  ['document_types', { id: { type: 'id' }, name: text(true, 80), created_at: timestamp }],
  [
    'assets',
    {
      id: { type: 'id' },
      name: text(true),
      manufacturer: text(),
      model_number: text(),
      serial_number: text(),
      purchase_date: optionalTimestamp,
      price_minor: { type: 'int', min: 0 },
      currency: text(false, 16),
      quantity: { type: 'int', required: true, min: 1 },
      external_url: text(),
      notes: text(),
      tags_json: text(),
      status: { type: 'enum', values: ['active', 'archived', 'disposed', 'sold', 'lost'] },
      item_status: { type: 'enum', values: ['available', 'reserved', 'in_use', 'in_repair', 'retired'] },
      category_id: { type: 'ref', table: 'asset_options', kind: 'category' },
      location_id: { type: 'ref', table: 'asset_options', kind: 'location' },
      completeness: { type: 'enum', values: ['draft', 'partial', 'complete'] },
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: optionalTimestamp,
      deleted_at: optionalTimestamp,
    },
  ],
  [
    'warranties',
    {
      asset_id: { type: 'ref', table: 'assets', required: true },
      kind: { type: 'enum', values: ['fixed', 'lifetime', 'unknown'], required: true },
      scope: text(),
      expires_on: optionalTimestamp,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
  [
    'maintenance_plans',
    {
      id: { type: 'id' },
      asset_id: { type: 'ref', table: 'assets', required: true },
      title: text(true),
      schedule_kind: { type: 'enum', values: ['one_off', 'recurring'], required: true },
      interval_value: { type: 'int', min: 1 },
      interval_unit: { type: 'enum', values: ['days', 'weeks', 'months', 'years'] },
      next_due_on: optionalTimestamp,
      notes: text(),
      status: { type: 'enum', values: ['active', 'paused', 'completed'] },
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
  [
    'maintenance_records',
    {
      id: { type: 'id' },
      plan_id: { type: 'ref', table: 'maintenance_plans', required: true },
      due_on: optionalTimestamp,
      status: { type: 'enum', values: ['completed', 'skipped'], required: true },
      performed_on: optionalTimestamp,
      notes: text(),
      created_at: timestamp,
    },
  ],
  [
    'asset_files',
    {
      id: { type: 'id' },
      asset_id: { type: 'ref', table: 'assets', required: true },
      kind: { type: 'enum', values: ['photo', 'receipt', 'manual', 'other'], required: true },
      kind_locked: { type: 'int', min: 0, max: 1 },
      ...fileColumns,
    },
  ],
  ['inbox_files', { id: { type: 'id' }, ...fileColumns }],
  [
    'documents',
    {
      id: { type: 'id' },
      name: text(true),
      type: text(false, 80),
      document_type_id: { type: 'ref', table: 'document_types' },
      tags_json: text(),
      notes: text(),
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: optionalTimestamp,
    },
  ],
  [
    'document_files',
    { id: { type: 'id' }, document_id: { type: 'ref', table: 'documents', required: true }, ...fileColumns },
  ],
  [
    'document_ocr',
    {
      document_id: { type: 'ref', table: 'documents', required: true },
      status: {
        type: 'enum',
        values: ['pending', 'processing', 'completed', 'failed', 'unsupported'],
        required: true,
      },
      text: text(false, 2_000_000),
      error: text(false, 2_000),
      updated_at: timestamp,
    },
  ],
];
const requiredTables = [
  'assets',
  'warranties',
  'maintenance_plans',
  'maintenance_records',
  'asset_files',
  'inbox_files',
  'documents',
  'document_files',
  'document_ocr',
];
const fileAreas: Record<string, StorageArea> = {
  asset_files: 'items',
  inbox_files: 'inbox',
  document_files: 'documents',
};

function fail(table: string, index: number, column: string): never {
  throw new BackupError(`Pakiet zawiera nieprawidłową wartość: ${table}[${index}].${column}.`);
}

function storedExtension(name: string): string {
  return /\.[a-zA-Z0-9]{1,12}$/.exec(name)?.[0] ?? '';
}

/**
 * Validates a parsed backup package and rewrites it for the target household.
 * Every record and file receives a new identifier, so a package can never reference or
 * overwrite rows or files outside the household being restored.
 */
export function prepareRestore(input: unknown): PreparedRestore {
  const pkg = input as { format?: unknown; version?: unknown; tables?: unknown; files?: unknown } | null;
  const source = pkg?.tables as Record<string, unknown> | undefined;
  if (
    !pkg ||
    pkg.format !== 'boberit-backup' ||
    pkg.version !== 1 ||
    !source ||
    typeof source !== 'object' ||
    !requiredTables.every((key) => Array.isArray(source[key])) ||
    !Array.isArray(pkg.files)
  )
    throw new BackupError('To nie jest obsługiwany pakiet Boberit v1.');

  const contents = new Map<string, string>();
  for (const file of pkg.files as { storedName?: unknown; base64?: unknown }[]) {
    if (typeof file?.storedName !== 'string' || typeof file.base64 !== 'string')
      throw new BackupError('Pakiet zawiera uszkodzony załącznik.');
    contents.set(file.storedName, file.base64);
  }

  const ids = new Map<string, Map<string, string>>();
  const optionKinds = new Map<string, string>();
  const result: PreparedRestore = { tables: {}, files: [] };

  for (const [table, columns] of tables) {
    const rows = source[table] ?? [];
    if (!Array.isArray(rows)) throw new BackupError(`Nieprawidłowa tabela backupu: ${table}.`);
    const tableIds = new Map<string, string>();
    ids.set(table, tableIds);
    result.tables[table] = rows.map((raw: unknown, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(table, index, '*');
      const row = raw as Row;
      const out: Record<string, Value> = {};
      for (const [column, field] of Object.entries(columns)) {
        const value = row[column] ?? null;
        if (field.type === 'id') {
          if (typeof value !== 'string' || !value || tableIds.has(value)) fail(table, index, column);
          tableIds.set(value, randomUUID());
          out[column] = tableIds.get(value)!;
        } else if (field.type === 'ref') {
          if (value === null) {
            if (field.required) fail(table, index, column);
            continue;
          }
          const target = typeof value === 'string' ? ids.get(field.table)?.get(value) : undefined;
          if (!target || (field.kind && optionKinds.get(target) !== field.kind)) fail(table, index, column);
          out[column] = target;
        } else if (field.type === 'text') {
          if (value === null) {
            if (field.required) fail(table, index, column);
          } else if (typeof value !== 'string' || value.length > (field.max ?? 100_000)) fail(table, index, column);
          else if (field.required && !value.trim()) fail(table, index, column);
          else out[column] = value;
        } else if (field.type === 'int') {
          if (value === null) {
            if (field.required) fail(table, index, column);
          } else if (
            !Number.isSafeInteger(value) ||
            (field.min !== undefined && (value as number) < field.min) ||
            (field.max !== undefined && (value as number) > field.max)
          )
            fail(table, index, column);
          else out[column] = value as number;
        } else if (field.type === 'enum') {
          if (value === null) {
            if (field.required) fail(table, index, column);
            continue;
          }
          if (typeof value !== 'string' || !field.values.includes(value)) fail(table, index, column);
          out[column] = value;
        } else {
          // Stored files get fresh server-side names; the package name is only a key into its file list.
          const base64 = typeof value === 'string' ? contents.get(value) : undefined;
          if (base64 === undefined) throw new BackupError('Pakiet nie zawiera wszystkich załączników.');
          const data = Buffer.from(base64, 'base64');
          if (!data.length || data.length > maxUploadBytes)
            throw new BackupError('Pakiet zawiera uszkodzony lub zbyt duży załącznik.');
          const storedName = `${randomUUID()}${storedExtension(value as string)}`;
          result.files.push({ area: fileAreas[table]!, storedName, data });
          out[column] = storedName;
          out.byte_size = data.length;
        }
      }
      if (table === 'asset_options') optionKinds.set(String(out.id), String(out.kind));
      if (table in fileAreas && !storedFileTypes.has(String(out.mime_type)))
        throw new BackupError('Pakiet zawiera załącznik nieobsługiwanego typu.');
      // An interrupted OCR run cannot resume after a restore.
      if (table === 'document_ocr' && out.status === 'processing') out.status = 'pending';
      return out;
    });
  }
  return result;
}
