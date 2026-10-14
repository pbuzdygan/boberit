import { Hono } from 'hono';
import { BackupError, prepareRestore } from '../backup.js';
import { addAuditEvent } from '../db/audit.js';
import { exportBackupData, restoreBackupData } from '../db/backup.js';
import { megabyte, failure, json } from '../http.js';
import { notify } from '../notify.js';
import { confirmPassword } from '../passwords.js';
import { requireOwner } from '../session.js';
import { readStoredFile, removeStoredFiles, writeStoredFile } from '../storage.js';

export const backupRoutes = new Hono();
export const maxBackupBytes = 100 * megabyte;
backupRoutes.post('/api/v1/settings/export', async (c) => {
  const { user, denied } = requireOwner(c, 'Tylko właściciel może pobrać backup gospodarstwa.');
  if (denied) return denied;
  const input = await json<{ password?: string }>(c.req.raw);
  const rejected = await confirmPassword(c, String(user.id), input.password);
  if (rejected) return rejected;
  const scope = String(user.household_id);
  const backup = exportBackupData(scope);
  const files = backup.files.flatMap(({ area, storedName }) => {
    try {
      return [{ storedName, base64: readStoredFile(area, scope, storedName).toString('base64') }];
    } catch {
      return [];
    }
  });
  const filename = `boberit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  addAuditEvent({
    householdId: scope,
    userId: String(user.id),
    action: 'exported',
    entityKind: 'backup',
    entityId: scope,
    label: filename,
  });
  notify('backup.exported', {}, scope);
  return new Response(
    JSON.stringify({
      format: 'boberit-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      tables: backup.tables,
      files,
    }),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
});
backupRoutes.post('/api/v1/settings/import', async (c) => {
  const { user, denied } = requireOwner(c, 'Tylko właściciel może odtworzyć backup gospodarstwa.');
  if (denied) return denied;
  const form = await c.req.raw.formData();
  const raw = form.get('file');
  const confirmation = String(form.get('confirmation') ?? '');
  if (!raw || typeof raw === 'string') return c.json(failure('Wybierz pakiet Boberit.'), 400);
  if (confirmation !== 'ZASTĄP') return c.json(failure('Wpisz ZASTĄP, aby potwierdzić odtworzenie.'), 400);
  const rejected = await confirmPassword(c, String(user.id), form.get('password'));
  if (rejected) return rejected;
  if (raw.size > maxBackupBytes) return c.json(failure('Pakiet jest zbyt duży. Maksymalny rozmiar to 100 MB.'), 400);
  let prepared;
  try {
    prepared = prepareRestore(JSON.parse(await raw.text()));
  } catch (error) {
    if (error instanceof BackupError) return c.json(failure(error.message), 400);
    if (error instanceof SyntaxError) return c.json(failure('Plik nie jest poprawnym JSON-em backupu.'), 400);
    throw error;
  }
  const scope = String(user.household_id);
  // New files get fresh names, so they are written before the database switches to them; on any
  // failure they are removed again and the household keeps its current data and files.
  const written: { householdId: string; storedName: string }[] = [];
  let oldFiles;
  try {
    for (const file of prepared.files) {
      writeStoredFile(file.area, scope, file.storedName, file.data);
      written.push({ householdId: scope, storedName: file.storedName });
    }
    oldFiles = restoreBackupData(scope, prepared.tables);
  } catch (error) {
    removeStoredFiles(written);
    console.error('Odtwarzanie backupu nie powiodło się:', error);
    return c.json(failure('Nie udało się odtworzyć pakietu. Dane gospodarstwa pozostały bez zmian.'), 400);
  }
  try {
    removeStoredFiles(oldFiles.map((file) => ({ householdId: scope, storedName: file.storedName })));
  } catch (error) {
    // The restore is complete; a leftover old file is only unused disk space.
    console.error('Nie udało się usunąć poprzednich plików po odtworzeniu:', error);
  }
  addAuditEvent({
    householdId: scope,
    userId: String(user.id),
    action: 'restored',
    entityKind: 'backup',
    entityId: scope,
    label: raw.name.slice(0, 200),
  });
  notify('backup.restored', { attachments: prepared.files.length }, scope);
  return c.json({ data: { restored: true, attachments: prepared.files.length } });
});
