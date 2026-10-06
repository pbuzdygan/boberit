import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const dataDirectory = mkdtempSync(join(tmpdir(), 'boberit-search-'));
process.env.APP_DATA_DIR = dataDirectory;
const { database, createDocument, createAsset, listDocuments, listAssets,
  saveDocumentOcrText, moveDocumentToTrash, moveAssetToTrash } = await import('../src/db.ts');
after(() => { database.close(); rmSync(dataDirectory, { recursive: true, force: true }); });
for (const id of ['home', 'other']) {
  database.prepare('INSERT INTO households(id,name,created_at) VALUES(?,?,?)').run(id, id, new Date().toISOString());
}
const document = createDocument('home', { name: 'Instrukcja', tags: ['elektronika'] });
saveDocumentOcrText('home', document.id, 'INFORMATION Gwarancja ŻÓŁĆ model AB%_12 "quoted"');
const asset = createAsset('home', { name: 'Information panel', serialNumber: 'AB%_12', notes: 'ŻÓŁĆ', tags: ['elektronika'] });
const documentIds = (query, household = 'home') => listDocuments(household, query).map(value => value.id);
const assetIds = (query, household = 'home') => listAssets(household, query).map(value => value.id);

test('OCR and asset search find full words, prefixes, middle and suffix in either case', () => {
  for (const query of ['INFORMATION', 'information', 'INFOR', 'ORMATIO', 'ormatio', 'MATION', 'io', 'I']) {
    assert.deepEqual(documentIds(query), [document.id], query);
    assert.deepEqual(assetIds(query), [asset.id], query);
  }
  for (const query of ['ŻÓŁĆ', 'żółć', 'ŻÓŁĆ'.normalize('NFD')]) {
    assert.deepEqual(documentIds(query), [document.id], query);
    assert.deepEqual(assetIds(query), [asset.id], query);
  }
});

test('all whitespace-separated fragments are required regardless of order', () => {
  assert.deepEqual(documentIds('  gwaranc   ORMATIO\ntronika  '), [document.id]);
  assert.deepEqual(assetIds('tronika ORMATIO'), [asset.id]);
  assert.deepEqual(documentIds('ormatio missing'), []);
  assert.deepEqual(assetIds('ormatio missing'), []);
});

test('punctuation and search operators are literal text, never wildcard syntax', () => {
  assert.deepEqual(documentIds('AB%_12'), [document.id]);
  assert.deepEqual(assetIds('AB%_12'), [asset.id]);
  assert.deepEqual(documentIds('"quoted"'), [document.id]);
  for (const query of ['*', '"', '%missing_', 'ormatio OR missing']) {
    assert.doesNotThrow(() => documentIds(query));
    assert.doesNotThrow(() => assetIds(query));
  }
  assert.deepEqual(documentIds('*'), []);
  assert.deepEqual(assetIds('*'), []);
});

test('empty query returns the full collection even after a search with no results', () => {
  assert.deepEqual(documentIds('not-found'), []);
  assert.deepEqual(assetIds('not-found'), []);
  assert.deepEqual(documentIds('  \n '), [document.id]);
  assert.deepEqual(assetIds(''), [asset.id]);
});

test('search respects household boundaries and trash/archive exclusions', () => {
  const otherDocument = createDocument('other', { name: 'INFORMATION' });
  const otherAsset = createAsset('other', { name: 'INFORMATION' });
  const deletedDocument = createDocument('home', { name: 'INFORMATION' });
  const deletedAsset = createAsset('home', { name: 'INFORMATION' });
  const archivedAsset = createAsset('home', { name: 'INFORMATION' });
  moveDocumentToTrash('home', deletedDocument.id);
  moveAssetToTrash('home', deletedAsset.id);
  database.prepare('UPDATE assets SET archived_at=? WHERE id=?').run(new Date().toISOString(), archivedAsset.id);
  assert.deepEqual(documentIds('ORMATIO'), [document.id]);
  assert.deepEqual(assetIds('ORMATIO'), [asset.id]);
  assert.deepEqual(documentIds('ORMATIO', 'other'), [otherDocument.id]);
  assert.deepEqual(assetIds('ORMATIO', 'other'), [otherAsset.id]);
});

test('saving corrected OCR immediately replaces the searchable text', () => {
  const corrected = createDocument('home', { name: 'Korekta' });
  saveDocumentOcrText('home', corrected.id, 'before-correction');
  assert.deepEqual(documentIds('fore-corr'), [corrected.id]);
  saveDocumentOcrText('home', corrected.id, 'after-correction');
  assert.deepEqual(documentIds('fore-corr'), []);
  assert.deepEqual(documentIds('fter-corr'), [corrected.id]);
});
