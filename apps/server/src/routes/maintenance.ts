import type { IntervalUnit, ScheduleKind } from '@boberit/shared';
import { Hono } from 'hono';
import {
  completeMaintenancePlan,
  updateMaintenancePlan,
  deleteMaintenancePlan,
  createMaintenancePlan,
} from '../db/maintenance.js';
import { failure, json } from '../http.js';
import { notify } from '../notify.js';
import { householdId } from '../session.js';

export const maintenanceRoutes = new Hono();
maintenanceRoutes.post('/api/v1/assets/:id/maintenance-plans', async (c) => {
  const plan = createMaintenancePlan(
    householdId(c.req.raw),
    c.req.param('id'),
    await json<{
      title: string;
      scheduleKind: ScheduleKind;
      intervalValue?: number;
      intervalUnit?: IntervalUnit;
      nextDueOn?: string;
      notes?: string;
    }>(c.req.raw),
  );
  if (plan) notify('maintenance.created', { id: plan.id, title: plan.title }, householdId(c.req.raw));
  return plan ? c.json({ data: plan }, 201) : c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
});
maintenanceRoutes.patch('/api/v1/maintenance-plans/:id', async (c) => {
  const plan = updateMaintenancePlan(
    householdId(c.req.raw),
    c.req.param('id'),
    await json<{
      title: string;
      scheduleKind: ScheduleKind;
      intervalValue?: number | null;
      intervalUnit?: IntervalUnit | null;
      nextDueOn?: string | null;
      notes?: string | null;
    }>(c.req.raw),
  );
  return plan ? c.json({ data: plan }) : c.json(failure('Nie znaleziono planu.', 404, 'NOT_FOUND'), 404);
});
maintenanceRoutes.delete('/api/v1/maintenance-plans/:id', (c) =>
  deleteMaintenancePlan(householdId(c.req.raw), c.req.param('id'))
    ? c.body(null, 204)
    : c.json(failure('Nie znaleziono planu.', 404, 'NOT_FOUND'), 404),
);
maintenanceRoutes.post('/api/v1/maintenance-plans/:id/complete', async (c) => {
  const plan = completeMaintenancePlan(
    householdId(c.req.raw),
    c.req.param('id'),
    await json<{ performedOn?: string; notes?: string }>(c.req.raw),
  );
  if (plan) notify('maintenance.completed', { id: plan.id, title: plan.title }, householdId(c.req.raw));
  return plan ? c.json({ data: plan }) : c.json(failure('Nie znaleziono planu.', 404, 'NOT_FOUND'), 404);
});
