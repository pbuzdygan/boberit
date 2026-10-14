import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackupError, prepareRestore } from '../src/backup.ts';

const now = '2026-01-01T00:00:00.000Z';
function backup(tables = {}, files = []) {
  return {
    format: 'boberit-backup',
    version: 1,
    tables: {
      assets: [],
      warranties: [],
      maintenance_plans: [],
      maintenance_records: [],
      asset_files: [],
      inbox_files: [],
      documents: [],
      document_files: [],
      document_ocr: [],
      ...tables,
    },
    files,
  };
}
const asset = { id: 'a1', name: 'Kettle', quantity: 1, created_at: now, updated_at: now };
const file = (extra) => ({
  id: 'f1',
  asset_id: 'a1',
  kind: 'receipt',
  original_name: 'receipt.pdf',
  stored_name: 'old.pdf',
  mime_type: 'application/pdf',
  byte_size: 999,
  created_at: now,
  ...extra,
});

test('records and files receive new identifiers and server-controlled columns', () => {
  const prepared = prepareRestore(
    backup({ assets: [{ ...asset, household_id: 'foreign', unknown_column: 'x' }], asset_files: [file()] }, [
      { storedName: 'old.pdf', base64: Buffer.from('%PDF-1.7').toString('base64') },
    ]),
  );
  const [restoredAsset] = prepared.tables.assets;
  const [restoredFile] = prepared.tables.asset_files;
  assert.notEqual(restoredAsset.id, 'a1');
  assert.ok(!('household_id' in restoredAsset) && !('unknown_column' in restoredAsset));
  assert.equal(restoredFile.asset_id, restoredAsset.id);
  assert.notEqual(restoredFile.stored_name, 'old.pdf');
  assert.match(restoredFile.stored_name, /^[0-9a-f-]{36}\.pdf$/);
  assert.equal(restoredFile.byte_size, 8);
  assert.deepEqual(
    prepared.files.map((entry) => [entry.area, entry.storedName, entry.data.toString()]),
    [['items', restoredFile.stored_name, '%PDF-1.7']],
  );
});

test('references outside the package are rejected', () => {
  const plan = {
    id: 'p1',
    asset_id: 'not-in-package',
    title: 'x',
    schedule_kind: 'one_off',
    created_at: now,
    updated_at: now,
  };
  assert.throws(() => prepareRestore(backup({ assets: [asset], maintenance_plans: [plan] })), BackupError);
  const located = { ...asset, location_id: 'o1' };
  const category = { id: 'o1', kind: 'category', name: 'Kitchen', created_at: now };
  assert.throws(() => prepareRestore(backup({ asset_options: [category], assets: [located] })), BackupError);
});

test('attachment types, sizes and values are validated', () => {
  const content = [{ storedName: 'old.pdf', base64: Buffer.from('x').toString('base64') }];
  for (const extra of [{ mime_type: 'text/html' }, { mime_type: 'image/svg+xml' }, { kind: 'script' }])
    assert.throws(() => prepareRestore(backup({ assets: [asset], asset_files: [file(extra)] }, content)), BackupError);
  assert.throws(() => prepareRestore(backup({ assets: [asset], asset_files: [file()] })), BackupError);
  assert.throws(() => prepareRestore(backup({ assets: [{ ...asset, quantity: 0 }] })), BackupError);
  assert.throws(() => prepareRestore(backup({ assets: [asset, asset] })), BackupError);
  assert.throws(() => prepareRestore({ ...backup(), version: 2 }), BackupError);
});

test('restored files must match their declared type', () => {
  assert.throws(
    () =>
      prepareRestore(
        backup({ assets: [asset], asset_files: [file()] }, [
          { storedName: 'old.pdf', base64: Buffer.from('<html><script></script>').toString('base64') },
        ]),
      ),
    /zawartość nie pasuje do typu/,
  );
});
