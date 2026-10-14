import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listStoredFileLocations } from './db/backup.js';
import { seedDatabase } from './db/seed.js';
import { errorResponse, failure, megabyte } from './http.js';
import { maxBackupBytes, backupRoutes } from './routes/backup.js';
import { purgeExpiredTrash, trashRoutes } from './routes/trash.js';
import { householdsRoutes } from './routes/households.js';
import { dictionariesRoutes } from './routes/dictionaries.js';
import { authRoutes } from './routes/auth.js';
import { settingsRoutes } from './routes/settings.js';
import { webhooksRoutes } from './routes/webhooks.js';
import { assetsRoutes } from './routes/assets.js';
import { documentsRoutes } from './routes/documents.js';
import { filesRoutes } from './routes/files.js';
import { inboxRoutes } from './routes/inbox.js';
import { maintenanceRoutes } from './routes/maintenance.js';
import { requireSession } from './session.js';
import { migrateStoredFiles } from './storage.js';
import { maxUploadBytes } from './uploads.js';

const app = new Hono();
const port = Number(process.env.PORT ?? 3000);
const webDist = resolve(process.env.WEB_DIST ?? '../web/dist');
// Bodies are capped before they are read, so an anonymous client cannot make the server buffer large payloads.
function requestBodyLimit(path: string): number {
  if (path === '/api/v1/settings/import') return maxBackupBytes + megabyte;
  if (/^\/api\/v1\/(?:assets\/[^/]+\/files|documents\/[^/]+\/files|inbox\/files)$/.test(path))
    return maxUploadBytes + megabyte;
  if (path.startsWith('/api/v1/auth/')) return 16 * 1024;
  // Corrected OCR text may hold up to 2 million characters.
  return 8 * megabyte;
}

migrateStoredFiles(listStoredFileLocations());
if (process.env.SEED_DEMO === 'true') seedDatabase();
purgeExpiredTrash();
app.use('*', logger());
// The web app and API share one origin, so no CORS headers are sent and other origins cannot read
// API responses. The CSP fits the Vite build: bundled scripts only, no inline code. Attachment
// previews open as blob documents, which inherit this policy: images need `blob:`, and the
// browser's own image viewer styles itself inline, so inline styles are allowed (scripts are
// not; the app never inserts raw HTML). HSTS is left to the TLS-terminating reverse proxy.
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'blob:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    strictTransportSecurity: false,
    xFrameOptions: 'DENY',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [], usb: [] },
  }),
);
app.use('/api/*', (c, next) =>
  bodyLimit({
    maxSize: requestBodyLimit(c.req.path),
    onError: (c) => c.json(failure('Żądanie jest zbyt duże.', 413, 'PAYLOAD_TOO_LARGE'), 413),
  })(c, next),
);
app.use('/api/v1/*', requireSession);
app.get('/api/v1/health', (c) => c.json({ status: 'ok', service: 'boberit-api', time: new Date().toISOString() }));
for (const routes of [
  householdsRoutes,
  dictionariesRoutes,
  authRoutes,
  settingsRoutes,
  webhooksRoutes,
  backupRoutes,
  assetsRoutes,
  documentsRoutes,
  filesRoutes,
  inboxRoutes,
  maintenanceRoutes,
  trashRoutes,
])
  app.route('/', routes);
app.onError(errorResponse);

app.use('/*', serveStatic({ root: webDist }));
app.get(
  '*',
  () =>
    new Response(readFileSync(resolve(webDist, 'index.html')), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Boberit działa na http://localhost:${info.port}`);
});
