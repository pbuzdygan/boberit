import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export type StorageArea = 'items' | 'documents' | 'inbox';

export interface StoredFileLocation {
  area: StorageArea;
  householdId: string;
  storedName: string;
}

const dataDirectory = resolve(process.env.APP_DATA_DIR ?? join(process.cwd(), 'data'));
const legacyUploadDirectory = resolve(process.env.UPLOAD_DIR ?? join(dataDirectory, 'uploads'));
const storageAreas: StorageArea[] = ['items', 'documents', 'inbox'];

for (const area of storageAreas) mkdirSync(join(dataDirectory, area), { recursive: true });

function safeSegment(value: string, label: string): string {
  if (!value || basename(value) !== value || !/^[a-zA-Z0-9_.-]+$/.test(value)) {
    throw new Error('Nieprawidłowy ' + label + ' ścieżki pliku.');
  }
  return value;
}

function preferredPath(area: StorageArea, householdId: string, storedName: string): string {
  const directory = join(
    dataDirectory,
    area,
    safeSegment(householdId, 'identyfikator gospodarstwa'),
  );
  mkdirSync(directory, { recursive: true });
  return join(directory, safeSegment(storedName, 'identyfikator'));
}

function findStoredFile(storedName: string): string | null {
  const name = safeSegment(storedName, 'identyfikator');
  const legacy = join(legacyUploadDirectory, name);
  if (existsSync(legacy)) return legacy;

  for (const area of storageAreas) {
    const root = join(dataDirectory, area);
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(root, entry.name, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function resolveStoredFile(area: StorageArea, householdId: string, storedName: string): string {
  const preferred = preferredPath(area, householdId, storedName);
  if (existsSync(preferred)) return preferred;
  const current = findStoredFile(storedName);
  if (!current) throw new Error('Nie znaleziono zapisanego pliku.');
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

export function readStoredFileByName(storedName: string): Buffer {
  const path = findStoredFile(storedName);
  if (!path) throw new Error('Nie znaleziono zapisanego pliku.');
  return readFileSync(path);
}

export function relocateStoredFile(area: StorageArea, householdId: string, storedName: string): void {
  resolveStoredFile(area, householdId, storedName);
}

export function removeStoredFiles(storedNames: string[]): void {
  for (const storedName of storedNames) {
    const path = findStoredFile(storedName);
    if (path) unlinkSync(path);
  }
}

export function migrateStoredFiles(files: StoredFileLocation[]): void {
  for (const file of files) {
    try { resolveStoredFile(file.area, file.householdId, file.storedName); }
    catch (error) { console.warn('Nie udało się zmigrować pliku ' + file.storedName + ':', error); }
  }
  if (existsSync(legacyUploadDirectory) && readdirSync(legacyUploadDirectory).length === 0) {
    rmdirSync(legacyUploadDirectory);
  }
}
