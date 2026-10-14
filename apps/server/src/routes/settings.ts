import { Hono } from 'hono';
import { listAuditEvents, storageUsage } from '../db/audit.js';
import { householdId } from '../session.js';

export const settingsRoutes = new Hono();
settingsRoutes.get('/api/v1/settings/activity', (c) => c.json({ data: listAuditEvents(householdId(c.req.raw)) }));
settingsRoutes.get('/api/v1/settings/storage', (c) => c.json({ data: storageUsage(householdId(c.req.raw)) }));
