import type { IntervalUnit, MaintenancePlan, ScheduleKind } from '@boberit/shared';
import { randomUUID } from 'node:crypto';
import { nextDueDate, today } from '../maintenance.js';
import { plansFor, getAsset } from './assets.js';
import { database } from './database.js';
import { type Row, now, nullable } from './values.js';
import { PublicError } from '../http.js';

export function createMaintenancePlan(
  householdId: string,
  assetId: string,
  input: {
    title: string;
    scheduleKind: ScheduleKind;
    intervalValue?: number | null;
    intervalUnit?: IntervalUnit;
    nextDueOn?: string;
    notes?: string;
  },
): MaintenancePlan | null {
  if (!getAsset(householdId, assetId)) return null;
  const title = input.title.trim();
  if (!title) throw new PublicError('Nazwa planu jest wymagana.');
  if (input.scheduleKind === 'recurring' && (!input.intervalValue || !input.intervalUnit))
    throw new PublicError('Plan cykliczny wymaga interwału.');
  const id = randomUUID();
  const timestamp = now();
  database
    .prepare(
      `INSERT INTO maintenance_plans(id, asset_id, title, schedule_kind, interval_value, interval_unit, next_due_on, notes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(
      id,
      assetId,
      title,
      input.scheduleKind,
      input.scheduleKind === 'recurring' ? Math.max(1, Number(input.intervalValue)) : null,
      input.scheduleKind === 'recurring' ? (input.intervalUnit ?? null) : null,
      nullable(input.nextDueOn),
      nullable(input.notes),
      timestamp,
      timestamp,
    );
  return plansFor(assetId).find((plan) => plan.id === id) ?? null;
}

export function updateMaintenancePlan(
  householdId: string,
  id: string,
  input: {
    title: string;
    scheduleKind: ScheduleKind;
    intervalValue?: number | null;
    intervalUnit?: IntervalUnit | null;
    nextDueOn?: string | null;
    notes?: string | null;
  },
): MaintenancePlan | null {
  const row = database
    .prepare(
      'SELECT p.asset_id FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id WHERE p.id=? AND a.household_id=? AND a.deleted_at IS NULL',
    )
    .get(id, householdId) as Row | undefined;
  if (!row) return null;
  const title = input.title.trim();
  if (!title) throw new PublicError('Nazwa planu jest wymagana.');
  if (input.scheduleKind === 'recurring' && (!input.intervalValue || !input.intervalUnit))
    throw new PublicError('Plan cykliczny wymaga interwału.');
  database
    .prepare(
      'UPDATE maintenance_plans SET title=?, schedule_kind=?, interval_value=?, interval_unit=?, next_due_on=?, notes=?, updated_at=? WHERE id=?',
    )
    .run(
      title,
      input.scheduleKind,
      input.scheduleKind === 'recurring' ? Math.max(1, Number(input.intervalValue)) : null,
      input.scheduleKind === 'recurring' ? (input.intervalUnit ?? null) : null,
      nullable(input.nextDueOn),
      nullable(input.notes),
      now(),
      id,
    );
  return plansFor(String(row.asset_id)).find((plan) => plan.id === id) ?? null;
}

export function deleteMaintenancePlan(householdId: string, id: string): boolean {
  const row = database
    .prepare(
      'SELECT p.id FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id WHERE p.id=? AND a.household_id=? AND a.deleted_at IS NULL',
    )
    .get(id, householdId) as Row | undefined;
  if (!row) return false;
  database.exec('BEGIN');
  try {
    database.prepare('DELETE FROM maintenance_records WHERE plan_id=?').run(id);
    database.prepare('DELETE FROM maintenance_plans WHERE id=?').run(id);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return true;
}

export function completeMaintenancePlan(
  householdId: string,
  id: string,
  input: { performedOn?: string; notes?: string },
): MaintenancePlan | null {
  const plan = database
    .prepare(
      'SELECT p.* FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id WHERE p.id = ? AND a.household_id = ? AND a.deleted_at IS NULL',
    )
    .get(id, householdId) as Row | undefined;
  if (!plan) return null;
  const performedOn = nullable(input.performedOn) ?? today();
  database
    .prepare(
      'INSERT INTO maintenance_records(id, plan_id, due_on, status, performed_on, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(randomUUID(), id, nullable(plan.next_due_on), 'completed', performedOn, nullable(input.notes), now());
  let nextDueOn: string | null = null;
  let status = 'completed';
  if (plan.schedule_kind === 'recurring') {
    nextDueOn = nextDueDate(performedOn, Number(plan.interval_value), plan.interval_unit as IntervalUnit);
    status = 'active';
  }
  database
    .prepare('UPDATE maintenance_plans SET next_due_on=?, status=?, updated_at=? WHERE id=?')
    .run(nextDueOn, status, now(), id);
  return plansFor(String(plan.asset_id)).find((entry) => entry.id === id) ?? null;
}
