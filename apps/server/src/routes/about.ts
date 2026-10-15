import { Hono } from 'hono';
import { createUpdateChecker } from '../updates.js';

const updates = createUpdateChecker({ version: process.env.APP_VERSION, channel: process.env.APP_RELEASE_CHANNEL });
export const aboutRoutes = new Hono();
aboutRoutes.get('/api/v1/settings/about', (c) => c.json({ data: updates.information() }));
aboutRoutes.post('/api/v1/settings/about/check', async (c) => c.json({ data: await updates.check() }));
