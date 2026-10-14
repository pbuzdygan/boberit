// Starts the real server (TypeScript sources via tsx) on temporary data, a random key, and a
// free port. Shared by black-box HTTP tests; never point it at real data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
export const password = 'correct-horse-battery';

export async function startTestServer(extraEnv = {}) {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'boberit-test-'));
  const webDirectory = mkdtempSync(join(tmpdir(), 'boberit-test-web-'));
  writeFileSync(join(webDirectory, 'index.html'), '<!doctype html>');
  const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDirectory,
    env: {
      PATH: process.env.PATH,
      PORT: '0',
      APP_DATA_DIR: dataDirectory,
      WEB_DIST: webDirectory,
      APP_ENC_KEY: randomBytes(32).toString('hex'),
      SEED_DEMO: 'false',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start:\n${output}`)), 20_000);
    const collect = (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    };
    server.stdout.on('data', collect);
    server.stderr.on('data', collect);
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}:\n${output}`));
    });
  });

  async function api(token, method, path, body, headers = {}) {
    const allHeaders = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers };
    let payload;
    if (body instanceof FormData || typeof body === 'string') payload = body;
    else if (body !== undefined) {
      allHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}/api/v1${path}`, { method, headers: allHeaders, body: payload });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* Not JSON. */
    }
    return { status: response.status, headers: response.headers, data: json?.data ?? null, error: json?.error, text };
  }

  async function ok(token, method, path, body) {
    const result = await api(token, method, path, body);
    assert.ok(result.status >= 200 && result.status < 300, `${method} ${path} -> ${result.status}: ${result.text}`);
    return result.data;
  }

  async function stop() {
    if (server.exitCode === null) {
      const exited = new Promise((resolve) => server.once('exit', resolve));
      server.kill();
      await exited;
    }
    rmSync(dataDirectory, { recursive: true, force: true });
    rmSync(webDirectory, { recursive: true, force: true });
  }

  return { baseUrl, api, ok, stop, output: () => output };
}

/** Registers the first owner and returns a session token. */
export async function registerOwner(instance, login = 'owner') {
  const registered = await instance.ok(null, 'POST', '/auth/register', {
    login,
    email: `${login}@example.test`,
    password,
    householdName: 'Dom',
  });
  return registered.token;
}
