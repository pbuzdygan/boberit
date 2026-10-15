import { randomUUID } from 'node:crypto';
import { database } from './database.js';
import { type Row, now } from './values.js';

export function addAuditEvent(input: {
  householdId: string;
  userId?: string;
  action: string;
  entityKind: string;
  entityId?: string;
  label?: string;
}): void {
  database
    .prepare(
      'INSERT INTO audit_events(id,household_id,user_id,action,entity_kind,entity_id,label,created_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      randomUUID(),
      input.householdId,
      input.userId ?? null,
      input.action,
      input.entityKind,
      input.entityId ?? null,
      input.label ?? null,
      now(),
    );
}
export function listAuditEvents(householdId: string, entityKind?: string, entityId?: string): Row[] {
  let sql =
    'SELECT e.*,u.login AS user_login FROM audit_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.household_id=?';
  const params: string[] = [householdId];
  if (entityKind && entityId) {
    sql += ' AND e.entity_kind=? AND e.entity_id=?';
    params.push(entityKind, entityId);
  }
  sql += ' ORDER BY e.created_at DESC LIMIT 100';
  return database.prepare(sql).all(...params) as Row[];
}
export function storageUsage(householdId: string): {
  bytes: number;
  purchaseValues: { currency: string; amountMinor: number }[];
} {
  const storage = database
    .prepare(
      'SELECT (SELECT COALESCE(SUM(f.byte_size),0) FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE a.household_id=?) + (SELECT COALESCE(SUM(f.byte_size),0) FROM document_files f JOIN documents d ON d.id=f.document_id WHERE d.household_id=?) + (SELECT COALESCE(SUM(byte_size),0) FROM inbox_files WHERE household_id=?) AS bytes',
    )
    .get(householdId, householdId, householdId) as Row;
  const values = database
    .prepare(
      "SELECT UPPER(COALESCE(NULLIF(TRIM(currency),''),'PLN')) AS currency, COALESCE(SUM(price_minor * CASE WHEN quantity > 0 THEN quantity ELSE 1 END),0) AS amount_minor FROM assets WHERE household_id=? AND deleted_at IS NULL AND archived_at IS NULL AND price_minor IS NOT NULL GROUP BY UPPER(COALESCE(NULLIF(TRIM(currency),''),'PLN')) ORDER BY currency",
    )
    .all(householdId) as Row[];
  return {
    bytes: Number(storage.bytes),
    purchaseValues: values.map((row) => ({ currency: String(row.currency), amountMinor: Number(row.amount_minor) })),
  };
}
