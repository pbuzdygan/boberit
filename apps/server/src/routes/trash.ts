import type { TrashKind } from '@boberit/shared';
import { Hono } from 'hono';
import { addAuditEvent } from '../db/audit.js';
import { listTrash, permanentlyDeleteTrash, permanentlyDeleteHouseholdTrash, restoreTrashEntry } from '../db/trash.js';
import { failure } from '../http.js';
import { requireOwner, householdId } from '../session.js';
import { removeStoredFiles } from '../storage.js';

export const trashRoutes = new Hono();
export function purgeExpiredTrash(): void {
  removeStoredFiles(permanentlyDeleteTrash(new Date(Date.now() - 30 * 86_400_000).toISOString()));
}
trashRoutes.get('/api/v1/trash', (c) => {
  purgeExpiredTrash();
  const requestedKind = c.req.query('kind');
  const kind: TrashKind | undefined =
    requestedKind === 'asset' || requestedKind === 'document' ? requestedKind : undefined;
  return c.json({ data: listTrash(householdId(c.req.raw), kind) });
});
trashRoutes.post('/api/v1/trash/:kind/:id/restore', (c) => {
  const kind = c.req.param('kind');
  if (kind !== 'asset' && kind !== 'document') return c.json(failure('Nieprawidłowy rodzaj elementu.'), 400);
  return restoreTrashEntry(householdId(c.req.raw), kind, c.req.param('id'))
    ? c.body(null, 204)
    : c.json(failure('Nie znaleziono elementu w Koszu.', 404, 'NOT_FOUND'), 404);
});
trashRoutes.delete('/api/v1/trash', (c) => {
  const { user, denied } = requireOwner(c, 'Tylko właściciel może trwale opróżnić Kosz.');
  if (denied) return denied;
  const scope = String(user.household_id);
  const removed = permanentlyDeleteHouseholdTrash(scope);
  removeStoredFiles(removed.map((storedName) => ({ householdId: scope, storedName })));
  addAuditEvent({
    householdId: scope,
    userId: String(user.id),
    action: 'emptied',
    entityKind: 'trash',
    entityId: scope,
    label: `Usunięte pliki: ${removed.length}`,
  });
  return c.body(null, 204);
});
