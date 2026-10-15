import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { PublicError } from './http.js';

export type StorageArea = 'items' | 'documents' | 'inbox';

export interface StoredFileLocation {
  area: StorageArea;
  householdId: string;
  storedName: string;
}

export interface StoredFileRef {
  householdId: string;
  storedName: string;
}

const dataDirectory = resolve(process.env.APP_DATA_DIR ?? join(process.cwd(), 'data'));
const legacyUploadDirectory = resolve(process.env.UPLOAD_DIR ?? join(dataDirectory, 'uploads'));
const storageAreas: StorageArea[] = ['items', 'documents', 'inbox'];

for (const area of storageAreas) mkdirSync(join(dataDirectory, area), { recursive: true });

function safeSegment(value: string, label: string): string {
  // '.' and '..' pass the character check but would leave the household directory.
  if (!value || basename(value) !== value || !/^[a-zA-Z0-9_.-]+$/.test(value) || /^\.+$/.test(value)) {
    throw new Error('Nieprawidłowy ' + label + ' ścieżki pliku.');
  }
  return value;
}

function householdPath(area: StorageArea, householdId: string, storedName: string): string {
  return join(
    dataDirectory,
    area,
    safeSegment(householdId, 'identyfikator gospodarstwa'),
    safeSegment(storedName, 'identyfikator'),
  );
}

function preferredPath(area: StorageArea, householdId: string, storedName: string): string {
  const path = householdPath(area, householdId, storedName);
  mkdirSync(join(path, '..'), { recursive: true });
  return path;
}

// Lookups never leave the caller's household: a stored name alone must not reach another household's file.
function findInHousehold(householdId: string, storedName: string): string | null {
  for (const area of storageAreas) {
    const candidate = householdPath(area, householdId, storedName);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveStoredFile(area: StorageArea, householdId: string, storedName: string): string {
  const preferred = preferredPath(area, householdId, storedName);
  if (existsSync(preferred)) return preferred;
  // Inbox files move to items or documents when they are assigned.
  const current = findInHousehold(householdId, storedName);
  if (!current) throw new PublicError('Nie znaleziono zapisanego pliku.', 404, 'NOT_FOUND');
  try {
    renameSync(current, preferred);
    return preferred;
  } catch {
    return current;
  }
}

export function writeStoredFile(area: StorageArea, householdId: string, storedName: string, data: Buffer): void {
  writeFileSync(preferredPath(area, householdId, storedName), data, { flag: 'wx' });
}

export function readStoredFile(area: StorageArea, householdId: string, storedName: string): Buffer {
  return readFileSync(resolveStoredFile(area, householdId, storedName));
}

export function relocateStoredFile(area: StorageArea, householdId: string, storedName: string): void {
  resolveStoredFile(area, householdId, storedName);
}

export function removeStoredFiles(files: StoredFileRef[]): void {
  for (const file of files) {
    const path = findInHousehold(file.householdId, file.storedName);
    if (path) unlinkSync(path);
  }
}

// Startup only: moves files from the flat pre-household upload directory to the row's household.
export function migrateStoredFiles(files: StoredFileLocation[]): void {
  for (const file of files) {
    try {
      const preferred = preferredPath(file.area, file.householdId, file.storedName);
      if (existsSync(preferred)) continue;
      const legacy = join(legacyUploadDirectory, safeSegment(file.storedName, 'identyfikator'));
      const current = findInHousehold(file.householdId, file.storedName) ?? (existsSync(legacy) ? legacy : null);
      if (current) renameSync(current, preferred);
    } catch (error) {
      console.warn('Nie udało się zmigrować pliku ' + file.storedName + ':', error);
    }
  }
  if (existsSync(legacyUploadDirectory) && readdirSync(legacyUploadDirectory).length === 0) {
    rmdirSync(legacyUploadDirectory);
  }
}
