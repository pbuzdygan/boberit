import { Hono } from 'hono';
import {
  completeMaintenancePlan,
  updateMaintenancePlan,
  deleteMaintenancePlan,
  createMaintenancePlan,
} from '../db/maintenance.js';
import { failure } from '../http.js';
import { completionInput, planInput } from '../inputs.js';
import { readBody } from '../validate.js';
import { notify } from '../notify.js';
import { householdId } from '../session.js';

export const maintenanceRoutes = new Hono();
maintenanceRoutes.post('/api/v1/assets/:id/maintenance-plans', async (c) => {
  const plan = createMaintenancePlan(householdId(c.req.raw), c.req.param('id'), await readBody(c.req.raw, planInput));
  if (plan) notify('maintenance.created', { id: plan.id, title: plan.title }, householdId(c.req.raw));
  return plan ? c.json({ data: plan }, 201) : c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
});
maintenanceRoutes.patch('/api/v1/maintenance-plans/:id', async (c) => {
  const plan = updateMaintenancePlan(householdId(c.req.raw), c.req.param('id'), await readBody(c.req.raw, planInput));
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
    await readBody(c.req.raw, completionInput),
  );
  if (plan) notify('maintenance.completed', { id: plan.id, title: plan.title }, householdId(c.req.raw));
  return plan ? c.json({ data: plan }) : c.json(failure('Nie znaleziono planu.', 404, 'NOT_FOUND'), 404);
});
