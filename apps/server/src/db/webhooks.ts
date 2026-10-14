import { randomUUID } from 'node:crypto';
import { database } from './database.js';
import { type Row, now } from './values.js';

export function addWebhookDelivery(input: {
  webhookId: string;
  event: string;
  status: number | null;
  error: string | null;
}): void {
  database
    .prepare('INSERT INTO webhook_deliveries(id,webhook_id,event,status,error,created_at) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(), input.webhookId, input.event, input.status, input.error, now());
}
export function listWebhookDeliveries(userId: string): Row[] {
  return database
    .prepare(
      'SELECT d.*,w.name AS webhook_name FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE w.user_id=? ORDER BY d.created_at DESC LIMIT 30',
    )
    .all(userId) as Row[];
}

export function listWebhooks(userId: string): Row[] {
  return database
    .prepare(
      'SELECT id, name, url, events_json, scope_all, household_ids_json, created_at FROM webhooks WHERE user_id=? ORDER BY created_at DESC',
    )
    .all(userId) as Row[];
}
export function createWebhook(input: {
  userId: string;
  name: string;
  url: string;
  secretEncrypted: string | null;
  events: string[];
  householdIds?: string[];
}): Row {
  const id = randomUUID();
  const createdAt = now();
  const ids = [...new Set(input.householdIds ?? [])];
  const all = ids.length === 0 ? 1 : 0;
  database
    .prepare(
      'INSERT INTO webhooks(id,user_id,name,url,secret_encrypted,events_json,scope_all,household_ids_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      input.userId,
      input.name,
      input.url,
      input.secretEncrypted,
      JSON.stringify(input.events),
      all,
      JSON.stringify(ids),
      createdAt,
    );
  return {
    id,
    name: input.name,
    url: input.url,
    events: input.events,
    scopeAll: Boolean(all),
    householdIds: ids,
    createdAt,
  };
}
export function updateWebhook(
  userId: string,
  id: string,
  input: {
    name: string;
    url: string;
    secretEncrypted?: string | null | undefined;
    events: string[];
    householdIds?: string[];
  },
): boolean {
  const ids = [...new Set(input.householdIds ?? [])];
  const all = ids.length === 0 ? 1 : 0;
  const params = [input.name, input.url, JSON.stringify(input.events), all, JSON.stringify(ids)];
  if (input.secretEncrypted === undefined)
    return (
      database
        .prepare(
          'UPDATE webhooks SET name=?,url=?,events_json=?,scope_all=?,household_ids_json=? WHERE id=? AND user_id=?',
        )
        .run(...params, id, userId).changes > 0
    );
  return (
    database
      .prepare(
        'UPDATE webhooks SET name=?,url=?,events_json=?,scope_all=?,household_ids_json=?,secret_encrypted=? WHERE id=? AND user_id=?',
      )
      .run(...params, input.secretEncrypted, id, userId).changes > 0
  );
}
export function deleteWebhook(userId: string, id: string): boolean {
  return database.prepare('DELETE FROM webhooks WHERE id=? AND user_id=?').run(id, userId).changes > 0;
}
export function webhookTargets(event: string, householdId: string): Row[] {
  return (
    database
      .prepare('SELECT w.* FROM webhooks w JOIN household_members m ON m.user_id=w.user_id AND m.household_id=?')
      .all(householdId) as Row[]
  ).filter((r) => {
    try {
      return (
        (JSON.parse(String(r.events_json)) as string[]).includes(event) &&
        (Number(r.scope_all) === 1 ||
          (JSON.parse(String(r.household_ids_json ?? '[]')) as string[]).includes(householdId))
      );
    } catch {
      return false;
    }
  });
}
