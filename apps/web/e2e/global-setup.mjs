// Starts the built server on an isolated instance and returns the teardown.
// Never point this at real data: the data directory is always a fresh temp dir.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const serverEntry = join(repo, 'apps/server/dist/index.js');
const webDist = join(repo, 'apps/web/dist');
// Fixed first-run setup code, so the setup test does not have to read the server log.
const setupToken = 'e2e-setup-code-1234';

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(base, server, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Server exited with code ${server.exitCode}:\n${output()}`);
    try {
      const response = await fetch(`${base}/api/v1/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet; retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server did not become healthy within 20 s:\n${output()}`);
}

export default async function globalSetup() {
  if (!existsSync(serverEntry) || !existsSync(join(webDist, 'index.html'))) {
    throw new Error('Built app not found. Run `npm run build` before `npm run test:e2e`.');
  }
  const dataDirectory = mkdtempSync(join(tmpdir(), 'boberit-e2e-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let log = '';
  const server = spawn(process.execPath, [serverEntry], {
    cwd: repo,
    // Minimal environment so a developer's .env or shell variables cannot leak in.
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      APP_DATA_DIR: dataDirectory,
      WEB_DIST: webDist,
      APP_ENC_KEY: randomBytes(32).toString('hex'),
      TZ: 'Europe/Warsaw',
      SETUP_TOKEN: setupToken,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => (log += chunk));
  server.stderr.on('data', (chunk) => (log += chunk));

  const teardown = async () => {
    if (server.exitCode === null) {
      const exited = new Promise((resolve) => server.once('exit', resolve));
      server.kill('SIGTERM');
      await exited;
    }
    rmSync(dataDirectory, { recursive: true, force: true });
  };

  try {
    await waitForHealth(base, server, () => log);
  } catch (error) {
    await teardown();
    throw error;
  }
  // Environment set here is inherited by the test workers.
  process.env.BOBERIT_E2E_BASE_URL = base;
  process.env.BOBERIT_E2E_SETUP_TOKEN = setupToken;
  return teardown;
}
