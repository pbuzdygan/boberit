import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const dataDirectory = mkdtempSync(join(tmpdir(), 'boberit-storage-'));
process.env.APP_DATA_DIR = dataDirectory;
const storage = await import('../src/storage.ts');
after(() => rmSync(dataDirectory, { recursive: true, force: true }));

test('a stored name never resolves to another household', () => {
  storage.writeStoredFile('items', 'household-b', 'shared-name.txt', Buffer.from('B'));
  assert.throws(() => storage.readStoredFile('items', 'household-a', 'shared-name.txt'));
  assert.throws(() => storage.readStoredFile('inbox', 'household-a', 'shared-name.txt'));
  storage.removeStoredFiles([{ householdId: 'household-a', storedName: 'shared-name.txt' }]);
  assert.equal(storage.readStoredFile('items', 'household-b', 'shared-name.txt').toString(), 'B');
});

test('files move between areas of the same household', () => {
  storage.writeStoredFile('inbox', 'household-a', 'scan.pdf', Buffer.from('A'));
  storage.relocateStoredFile('documents', 'household-a', 'scan.pdf');
  assert.ok(existsSync(join(dataDirectory, 'documents', 'household-a', 'scan.pdf')));
  assert.ok(!existsSync(join(dataDirectory, 'inbox', 'household-a', 'scan.pdf')));
  storage.removeStoredFiles([{ householdId: 'household-a', storedName: 'scan.pdf' }]);
  assert.ok(!existsSync(join(dataDirectory, 'documents', 'household-a', 'scan.pdf')));
});

test('path segments cannot traverse directories', () => {
  assert.throws(() => storage.writeStoredFile('items', '..', 'x.txt', Buffer.from('x')));
  assert.throws(() => storage.writeStoredFile('items', 'household-a', '../x.txt', Buffer.from('x')));
});
