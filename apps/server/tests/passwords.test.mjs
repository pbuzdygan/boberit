import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { password, registerOwner, startTestServer } from './server-fixture.mjs';

const dataDirectory = mkdtempSync(join(tmpdir(), 'boberit-passwords-'));
const encryptionKey = randomBytes(32).toString('hex');
const databasePath = join(dataDirectory, 'db', 'boberit.sqlite');
after(() => rmSync(dataDirectory, { recursive: true, force: true }));

// The server must be stopped while the test reads or edits its database.
function withDatabase(action) {
  const database = new DatabaseSync(databasePath);
  try {
    return action(database);
  } finally {
    database.close();
  }
}
const storedHash = () =>
  withDatabase(
    (database) => database.prepare("SELECT password_hash FROM users WHERE login='owner'").get().password_hash,
  );

async function withServer(action) {
  const instance = await startTestServer({ dataDirectory, encryptionKey });
  try {
    return await action(instance);
  } finally {
    await instance.stop();
  }
}
const login = (instance, secret) => instance.api(null, 'POST', '/auth/login', { login: 'owner', password: secret });

test('new password hashes store their scrypt cost', async () => {
  await withServer((instance) => registerOwner(instance));
  assert.match(storedHash(), /^scrypt\$32768\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  await withServer(async (instance) => assert.equal((await login(instance, password)).status, 200));
});

test('a legacy hash still signs in and is upgraded only after a successful sign-in', async () => {
  const salt = randomBytes(16);
  const legacy = salt.toString('hex') + ':' + scryptSync(password, salt, 64).toString('hex');
  withDatabase((database) => database.prepare("UPDATE users SET password_hash=? WHERE login='owner'").run(legacy));

  await withServer(async (instance) => assert.equal((await login(instance, 'wrong-password-123')).status, 401));
  assert.equal(storedHash(), legacy);

  await withServer(async (instance) => assert.equal((await login(instance, password)).status, 200));
  const upgraded = storedHash();
  assert.match(upgraded, /^scrypt\$32768\$8\$3\$/);

  await withServer(async (instance) => {
    assert.equal((await login(instance, password)).status, 200);
    assert.equal((await login(instance, 'wrong-password-123')).status, 401);
  });
  assert.equal(storedHash(), upgraded);
});

test('a malformed stored hash never matches', async () => {
  withDatabase((database) =>
    database.prepare("UPDATE users SET password_hash='scrypt$1$1$1$00$00' WHERE login='owner'").run(),
  );
  await withServer(async (instance) => assert.equal((await login(instance, password)).status, 401));
});
