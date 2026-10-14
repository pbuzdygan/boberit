import { Hono } from 'hono';
import { listUserHouseholds } from '../db/accounts.js';
import { addAuditEvent } from '../db/audit.js';
import { listWebhookDeliveries, listWebhooks, createWebhook, updateWebhook, deleteWebhook } from '../db/webhooks.js';
import { failure, json } from '../http.js';
import { webhookUrlError } from '../outbound.js';
import { encryptSecret } from '../secrets.js';
import { currentUser } from '../session.js';

// Webhooks belong to a user and may cover several households; changes are recorded in the
// household that is active when the change is made.
function auditWebhook(user: Record<string, unknown>, action: string, id: string, name: string) {
  addAuditEvent({
    householdId: String(user.household_id),
    userId: String(user.id),
    action,
    entityKind: 'webhook',
    entityId: id,
    label: name,
  });
}

export const webhooksRoutes = new Hono();
webhooksRoutes.get('/api/v1/settings/webhook-deliveries', (c) => {
  const user = currentUser(c.req.raw)!;
  return c.json({ data: listWebhookDeliveries(String(user.id)) });
});
webhooksRoutes.get('/api/v1/settings/webhooks', (c) => {
  const user = currentUser(c.req.raw)!;
  return c.json({
    data: listWebhooks(String(user.id)).map((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      events: JSON.parse(String(row.events_json)),
      scopeAll: Number(row.scope_all) === 1,
      householdIds: JSON.parse(String(row.household_ids_json ?? '[]')),
      createdAt: row.created_at,
    })),
  });
});
webhooksRoutes.post('/api/v1/settings/webhooks', async (c) => {
  const input = await json<{ name: string; url: string; secret?: string; events: string[]; householdIds?: string[] }>(
    c.req.raw,
  );
  if (!input.name?.trim() || !Array.isArray(input.events) || !input.events.length)
    return c.json(failure('Podaj nazwę, adres HTTP(S) i co najmniej jedno zdarzenie.'), 400);
  const urlError = await webhookUrlError(input.url);
  if (urlError) return c.json(failure(urlError), 400);
  const user = currentUser(c.req.raw)!;
  const allowed = new Set(listUserHouseholds(String(user.id)).map((row) => String(row.id)));
  const householdIds = (input.householdIds ?? []).filter((id) => allowed.has(id));
  const hook = createWebhook({
    userId: String(user.id),
    name: input.name.trim(),
    url: input.url.trim(),
    secretEncrypted: encryptSecret(input.secret?.trim() ?? ''),
    events: input.events,
    householdIds,
  });
  auditWebhook(user, 'webhook.created', String(hook.id), input.name.trim());
  return c.json({ data: hook }, 201);
});
webhooksRoutes.patch('/api/v1/settings/webhooks/:id', async (c) => {
  const input = await json<{ name: string; url: string; secret?: string; events: string[]; householdIds?: string[] }>(
    c.req.raw,
  );
  if (!input.name?.trim() || !Array.isArray(input.events) || !input.events.length)
    return c.json(failure('Podaj nazwę, adres HTTP(S) i co najmniej jedno zdarzenie.'), 400);
  const urlError = await webhookUrlError(input.url);
  if (urlError) return c.json(failure(urlError), 400);
  const user = currentUser(c.req.raw)!;
  const allowed = new Set(listUserHouseholds(String(user.id)).map((row) => String(row.id)));
  const householdIds = (input.householdIds ?? []).filter((id) => allowed.has(id));
  const secretEncrypted = input.secret?.trim() ? encryptSecret(input.secret.trim()) : undefined;
  const updated = updateWebhook(String(user.id), c.req.param('id'), {
    name: input.name.trim(),
    url: input.url.trim(),
    secretEncrypted,
    events: input.events,
    householdIds,
  });
  if (!updated) return c.json(failure('Nie znaleziono webhooka.', 404, 'NOT_FOUND'), 404);
  auditWebhook(user, 'webhook.updated', c.req.param('id'), input.name.trim());
  return c.json({ data: { updated: true } });
});
webhooksRoutes.delete('/api/v1/settings/webhooks/:id', (c) => {
  const user = currentUser(c.req.raw)!;
  const name = listWebhooks(String(user.id)).find((row) => row.id === c.req.param('id'))?.name;
  if (!deleteWebhook(String(user.id), c.req.param('id')))
    return c.json(failure('Nie znaleziono webhooka.', 404, 'NOT_FOUND'), 404);
  auditWebhook(user, 'webhook.deleted', c.req.param('id'), String(name ?? ''));
  return c.body(null, 204);
});
