import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';

// Black-box test of the HTTP API: it starts the real server on temporary data, so
// authentication, household scoping and route handlers are exercised together.
const serverDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = mkdtempSync(join(tmpdir(), 'boberit-isolation-'));
const webDirectory = mkdtempSync(join(tmpdir(), 'boberit-isolation-web-'));
writeFileSync(join(webDirectory, 'index.html'), '<!doctype html>');
const password = 'correct-horse-battery';
let server;
let baseUrl;

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: serverDirectory,
      env: {
        ...process.env,
        PORT: '0',
        APP_DATA_DIR: dataDirectory,
        WEB_DIST: webDirectory,
        APP_ENC_KEY: randomBytes(32).toString('hex'),
        SEED_DEMO: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
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
    server.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}:\n${output}`));
    });
  });
}

async function api(token, method, path, body) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}/api/v1${path}`, { method, headers, body: payload });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text).data ?? null;
  } catch {
    data = text;
  }
  return { status: response.status, data, text };
}

async function ok(token, method, path, body, expected = [200, 201, 204]) {
  const result = await api(token, method, path, body);
  assert.ok(expected.includes(result.status), `${method} ${path} -> ${result.status}: ${result.text}`);
  return result.data;
}

function textFile(name, content) {
  const form = new FormData();
  form.set('file', new File([content], name, { type: 'text/plain' }));
  return form;
}

const login = async (name) => (await ok(null, 'POST', '/auth/login', { login: name, password })).token;
const useHousehold = (token, householdId) => ok(token, 'POST', '/households/active', { householdId });

// Fixture: owner A has household HA with data; member B belongs only to household HB.
const ha = {};
let ownerToken;
let memberToken;
let householdA;
let householdB;

before(async () => {
  baseUrl = await startServer();
  const registered = await ok(null, 'POST', '/auth/register', {
    login: 'owner',
    email: 'owner@example.test',
    password,
    householdName: 'Home A',
  });
  ownerToken = registered.token;
  householdA = registered.user.householdId;
  householdB = (await ok(ownerToken, 'POST', '/households', { name: 'Home B' })).id;
  await useHousehold(ownerToken, householdB);
  await ok(ownerToken, 'POST', '/household/members', {
    login: 'member',
    email: 'member@example.test',
    password,
    role: 'member',
  });
  await ok(ownerToken, 'POST', '/assets', { name: 'Home B kettle' });
  await useHousehold(ownerToken, householdA);

  ha.asset = (
    await ok(ownerToken, 'POST', '/assets', { name: 'Secret espresso machine', serialNumber: 'SECRET-123' })
  ).id;
  ha.assetFile = (
    await ok(ownerToken, 'POST', `/assets/${ha.asset}/files`, textFile('receipt.txt', 'secret receipt'))
  ).id;
  ha.plan = (
    await ok(ownerToken, 'POST', `/assets/${ha.asset}/maintenance-plans`, {
      title: 'Descale',
      scheduleKind: 'one_off',
      nextDueOn: '2030-01-01',
    })
  ).id;
  ha.document = (await ok(ownerToken, 'POST', '/documents', { name: 'Secret contract' })).id;
  ha.documentFile = (
    await ok(ownerToken, 'POST', `/documents/${ha.document}/files`, textFile('contract.txt', 'secret contract'))
  ).id;
  await ok(ownerToken, 'PUT', `/documents/${ha.document}/ocr`, { text: 'secret ocr text' });
  ha.inboxFile = (await ok(ownerToken, 'POST', '/inbox/files', textFile('scan.txt', 'secret scan'))).id;
  ha.trashed = (await ok(ownerToken, 'POST', '/assets', { name: 'Secret trashed lamp' })).id;
  await ok(ownerToken, 'DELETE', `/assets/${ha.trashed}`);

  memberToken = await login('member');
});

after(async () => {
  if (server && server.exitCode === null) {
    server.removeAllListeners('exit');
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  rmSync(dataDirectory, { recursive: true, force: true });
  rmSync(webDirectory, { recursive: true, force: true });
});

describe('household isolation', () => {
  test('member of another household starts in that household and cannot switch into a foreign one', async () => {
    const households = await ok(memberToken, 'GET', '/households');
    assert.equal(households.activeHouseholdId, householdB);
    assert.deepEqual(
      households.households.map((entry) => entry.id),
      [householdB],
    );
    assert.equal((await api(memberToken, 'POST', '/households/active', { householdId: householdA })).status, 403);
    assert.equal((await ok(memberToken, 'GET', '/households')).activeHouseholdId, householdB);
  });

  test('collections, search, trash and settings never include foreign records', async () => {
    const paths = [
      '/assets',
      '/assets?q=secret',
      '/documents',
      '/documents?q=secret',
      '/inbox',
      '/trash',
      '/settings/activity',
      '/household/members',
      '/household/asset-options',
      '/household/document-types',
    ];
    const foreignIds = Object.values(ha);
    for (const path of paths) {
      const { status, text } = await api(memberToken, 'GET', path);
      assert.equal(status, 200, path);
      for (const id of foreignIds) assert.ok(!text.includes(id), `${path} leaks ${id}`);
      // The owner legitimately appears in HB's member list, because they created HB.
      assert.ok(!/secret/i.test(text), `${path} leaks foreign content`);
    }
  });

  test('backup export contains only the active household', async () => {
    await useHousehold(ownerToken, householdB);
    let result;
    try {
      result = await api(ownerToken, 'POST', '/settings/export', { password });
    } finally {
      await useHousehold(ownerToken, householdA);
    }
    const { status, text } = result;
    assert.equal(status, 200);
    for (const id of Object.values(ha)) assert.ok(!text.includes(id), `backup leaks ${id}`);
    assert.ok(!text.includes(householdA), 'backup leaks the foreign household id');
    assert.ok(!text.includes(Buffer.from('secret').toString('base64')), 'backup leaks foreign file content');
    assert.ok(text.includes('Home B kettle'), 'backup should contain the active household data');
  });

  test('foreign records and files cannot be read or changed by id', async () => {
    const attempts = [
      ['GET', `/assets/${ha.asset}`],
      ['PATCH', `/assets/${ha.asset}`, { name: 'hijacked' }],
      ['PUT', `/assets/${ha.asset}/warranty`, { kind: 'lifetime' }],
      ['POST', `/assets/${ha.asset}/files`, textFile('x.txt', 'x')],
      ['PATCH', `/assets/${ha.asset}/files/${ha.assetFile}`, { kind: 'receipt' }],
      ['DELETE', `/assets/${ha.asset}/files/${ha.assetFile}`],
      [
        'POST',
        `/assets/${ha.asset}/maintenance-plans`,
        { title: 'x', scheduleKind: 'one_off', nextDueOn: '2030-01-01' },
      ],
      [
        'PATCH',
        `/maintenance-plans/${ha.plan}`,
        { title: 'hijacked', scheduleKind: 'one_off', nextDueOn: '2030-01-01' },
      ],
      ['POST', `/maintenance-plans/${ha.plan}/complete`, {}],
      ['DELETE', `/maintenance-plans/${ha.plan}`],
      ['GET', `/documents/${ha.document}/ocr`],
      ['POST', `/documents/${ha.document}/ocr`],
      ['PUT', `/documents/${ha.document}/ocr`, { text: 'hijacked' }],
      ['PATCH', `/documents/${ha.document}`, { name: 'hijacked' }],
      ['POST', `/documents/${ha.document}/files`, textFile('x.txt', 'x')],
      ['DELETE', `/documents/${ha.document}/files/${ha.documentFile}`],
      ['DELETE', `/documents/${ha.document}`],
      ['GET', `/files/${ha.assetFile}/download`],
      ['GET', `/files/${ha.documentFile}/download`],
      ['GET', `/files/${ha.inboxFile}/download`],
      ['GET', `/files/${ha.assetFile}/preview`],
      ['POST', `/inbox/${ha.inboxFile}/to-document`, {}],
      ['DELETE', `/inbox/${ha.inboxFile}`],
      ['POST', `/trash/asset/${ha.trashed}/restore`],
      ['DELETE', `/assets/${ha.asset}`],
    ];
    for (const [method, path, body] of attempts) {
      const { status, text } = await api(memberToken, method, path, body);
      assert.ok(status >= 400 && status < 500, `${method} ${path} -> ${status}: ${text}`);
      assert.ok(!/secret/i.test(text), `${method} ${path} leaks foreign content`);
    }
    await api(memberToken, 'POST', `/inbox/${ha.inboxFile}/assign`, { assetId: ha.asset });
    // Rejected uploads must not leave orphaned files in the member's own household storage.
    for (const area of ['items', 'documents']) {
      const directory = join(dataDirectory, area, householdB);
      assert.deepEqual(existsSync(directory) ? readdirSync(directory) : [], [], `orphaned files in ${area}`);
    }

    const asset = await ok(ownerToken, 'GET', `/assets/${ha.asset}`);
    assert.equal(asset.name, 'Secret espresso machine');
    assert.ok(JSON.stringify(asset).includes(ha.assetFile), 'asset file must survive');
    assert.ok(JSON.stringify(asset).includes(ha.plan), 'maintenance plan must survive');
    assert.equal((await ok(ownerToken, 'GET', `/documents/${ha.document}/ocr`)).text, 'secret ocr text');
    const documents = await ok(ownerToken, 'GET', '/documents');
    const document = documents.find((entry) => entry.id === ha.document);
    assert.equal(document?.name, 'Secret contract');
    assert.ok(JSON.stringify(document).includes(ha.documentFile), 'document file must survive');
    assert.ok(
      (await ok(ownerToken, 'GET', '/inbox')).some((entry) => JSON.stringify(entry).includes(ha.inboxFile)),
      'inbox file must survive',
    );
    assert.ok(
      (await ok(ownerToken, 'GET', '/trash')).some((entry) => entry.id === ha.trashed),
      'trashed asset must stay in trash',
    );
    assert.equal(await ok(ownerToken, 'GET', `/files/${ha.assetFile}/download`), 'secret receipt');
  });

  test('a user who belongs to both households only sees the active one', async () => {
    await useHousehold(ownerToken, householdB);
    try {
      assert.equal((await api(ownerToken, 'GET', `/assets/${ha.asset}`)).status, 404);
      assert.equal((await api(ownerToken, 'GET', `/files/${ha.assetFile}/download`)).status, 404);
      const { text } = await api(ownerToken, 'GET', '/assets');
      assert.ok(!text.includes(ha.asset));
    } finally {
      await useHousehold(ownerToken, householdA);
    }
  });

  test('a member cannot manage accounts or household dictionaries', async () => {
    const attempts = [
      ['POST', '/household/members', { login: 'intruder', email: 'intruder@example.test', password, role: 'owner' }],
      ['POST', '/household/asset-options', { kind: 'category', name: 'x' }],
      ['POST', '/household/document-types', { name: 'x' }],
    ];
    for (const [method, path, body] of attempts)
      assert.equal((await api(memberToken, method, path, body)).status, 403, path);
  });
});

describe('authentication', () => {
  test('data and files require a valid session', async () => {
    for (const token of [null, 'invalid-token']) {
      for (const path of [
        '/assets',
        '/documents',
        `/assets/${ha.asset}`,
        `/files/${ha.assetFile}/download`,
        '/settings/export',
      ]) {
        assert.equal((await api(token, 'GET', path)).status, 401, `${path} with ${token}`);
      }
    }
  });

  test('a second registration is rejected after setup', async () => {
    const { status } = await api(null, 'POST', '/auth/register', {
      login: 'attacker',
      email: 'attacker@example.test',
      password,
      householdName: 'X',
    });
    assert.equal(status, 409);
  });

  test('logout invalidates the session token', async () => {
    const token = await login('member');
    assert.equal((await api(token, 'GET', '/assets')).status, 200);
    await ok(token, 'POST', '/auth/logout');
    assert.equal((await api(token, 'GET', '/assets')).status, 401);
    assert.equal((await api(memberToken, 'GET', '/assets')).status, 200, 'other sessions stay valid');
  });
});

function backupForm(pkg, confirmPassword = password) {
  const form = new FormData();
  form.set('file', new File([JSON.stringify(pkg)], 'backup.json', { type: 'application/json' }));
  form.set('confirmation', 'ZASTĄP');
  form.set('password', confirmPassword);
  return form;
}
const exportBackup = async (token) => JSON.parse((await api(token, 'POST', '/settings/export', { password })).text);
// Every stored file below the household's storage directories.
function storedFiles(householdId) {
  return ['items', 'documents', 'inbox'].flatMap((area) => {
    const directory = join(dataDirectory, area, householdId);
    return existsSync(directory) ? readdirSync(directory) : [];
  });
}

describe('sensitive household operations', () => {
  test('a member cannot export, restore or permanently empty the trash', async () => {
    const pkg = await exportBackup(ownerToken);
    assert.equal((await api(memberToken, 'POST', '/settings/export', { password })).status, 403);
    assert.equal((await api(memberToken, 'POST', '/settings/import', backupForm(pkg))).status, 403);
    assert.equal((await api(memberToken, 'DELETE', '/trash')).status, 403);
  });

  test('export and restore require the current password', async () => {
    assert.equal((await api(ownerToken, 'POST', '/settings/export', { password: 'wrong-password-1' })).status, 401);
    const pkg = await exportBackup(ownerToken);
    const result = await api(ownerToken, 'POST', '/settings/import', backupForm(pkg, 'wrong-password-1'));
    assert.equal(result.status, 401);
  });
});

describe('request limits', () => {
  test('oversized anonymous bodies are rejected before they are read', async () => {
    const body = JSON.stringify({ login: 'x'.repeat(64 * 1024), password });
    assert.equal((await api(null, 'POST', '/auth/login', body)).status, 413);
  });

  test('repeated failed logins are throttled', async () => {
    const attempt = () => api(null, 'POST', '/auth/login', { login: 'nobody-throttled', password: 'wrong-password-1' });
    for (let index = 0; index < 5; index++) assert.equal((await attempt()).status, 401);
    const blocked = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'nobody-throttled', password: 'wrong-password-1' }),
    });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.ok((await login('member')).length > 0, 'other logins stay available');
  });
});

// Runs last: a successful restore gives every record in household A a new identifier.
describe('backup restore', () => {
  test('a package that references another household is rejected without changes', async () => {
    await useHousehold(ownerToken, householdB);
    const foreignAsset = (await ok(ownerToken, 'GET', '/assets'))[0];
    await useHousehold(ownerToken, householdA);
    const before = storedFiles(householdA).sort();
    const pkg = await exportBackup(ownerToken);
    const now = new Date().toISOString();
    pkg.tables.maintenance_plans.push({
      id: 'foreign-plan',
      asset_id: foreignAsset.id,
      title: 'Injected',
      schedule_kind: 'one_off',
      created_at: now,
      updated_at: now,
    });
    const result = await api(ownerToken, 'POST', '/settings/import', backupForm(pkg));
    assert.equal(result.status, 400, result.text);
    await useHousehold(ownerToken, householdB);
    try {
      const foreign = await ok(ownerToken, 'GET', `/assets/${foreignAsset.id}`);
      assert.deepEqual(foreign.maintenancePlans, []);
    } finally {
      await useHousehold(ownerToken, householdA);
    }
    assert.equal((await ok(ownerToken, 'GET', `/assets/${ha.asset}`)).name, 'Secret espresso machine');
    assert.deepEqual(storedFiles(householdA).sort(), before);
  });

  test('attachments with active content types are rejected', async () => {
    const pkg = await exportBackup(ownerToken);
    pkg.tables.asset_files[0].mime_type = 'text/html';
    const result = await api(ownerToken, 'POST', '/settings/import', backupForm(pkg));
    assert.equal(result.status, 400, result.text);
    assert.equal(await ok(ownerToken, 'GET', `/files/${ha.assetFile}/download`), 'secret receipt');
  });

  test('a restore that fails in the database keeps the current data and files', async () => {
    const before = storedFiles(householdA).sort();
    const pkg = await exportBackup(ownerToken);
    const now = new Date().toISOString();
    // Two warranties for one asset pass validation but violate the primary key on insert.
    pkg.tables.warranties.push(
      { asset_id: ha.asset, kind: 'lifetime', created_at: now, updated_at: now },
      { asset_id: ha.asset, kind: 'unknown', created_at: now, updated_at: now },
    );
    const result = await api(ownerToken, 'POST', '/settings/import', backupForm(pkg));
    assert.equal(result.status, 400, result.text);
    assert.deepEqual(storedFiles(householdA).sort(), before, 'new files must be removed again');
    assert.equal(await ok(ownerToken, 'GET', `/files/${ha.assetFile}/download`), 'secret receipt');
  });

  test('a valid package restores data and files under new identifiers', async () => {
    const pkg = await exportBackup(ownerToken);
    const restored = await ok(ownerToken, 'POST', '/settings/import', backupForm(pkg));
    assert.equal(restored.attachments, pkg.files.length);
    assert.equal((await api(ownerToken, 'GET', `/assets/${ha.asset}`)).status, 404, 'identifiers are reassigned');
    const asset = (await ok(ownerToken, 'GET', '/assets')).find((entry) => entry.name === 'Secret espresso machine');
    assert.ok(asset, 'restored asset');
    assert.equal(asset.maintenancePlans.length, 1);
    assert.equal(await ok(ownerToken, 'GET', `/files/${asset.files[0].id}/download`), 'secret receipt');
    assert.equal(storedFiles(householdA).length, pkg.files.length, 'old files are removed');
    const activity = await ok(ownerToken, 'GET', '/settings/activity');
    assert.ok(activity.some((event) => event.action === 'restored' && event.entity_kind === 'backup'));
  });
});
