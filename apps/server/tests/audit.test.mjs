import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { password, registerOwner, startTestServer } from './server-fixture.mjs';

let instance;
let token;
before(async () => {
  instance = await startTestServer();
  token = await registerOwner(instance);
});
after(() => instance?.stop());

const activity = async () =>
  (await instance.ok(token, 'GET', '/settings/activity')).map((event) => [event.action, event.label]);

test('member changes are recorded in the household history', async () => {
  const member = await instance.ok(token, 'POST', '/household/members', {
    login: 'domownik',
    email: 'domownik@example.test',
    password,
    role: 'member',
  });
  await instance.ok(token, 'PATCH', `/household/members/${member.id}`, { role: 'owner' });
  await instance.ok(token, 'PATCH', `/household/members/${member.id}`, { role: 'member' });
  await instance.ok(token, 'DELETE', `/household/members/${member.id}`);
  const events = await activity();
  for (const action of ['member.added', 'member.promoted', 'member.demoted', 'member.removed'])
    assert.ok(
      events.some(([recorded, label]) => recorded === action && label === 'domownik'),
      `${action} in ${JSON.stringify(events)}`,
    );
});

test('webhook changes are recorded in the active household', async () => {
  // A literal public address avoids DNS lookups in the test.
  const input = { name: 'Powiadomienia', url: 'https://203.0.113.10/hook', events: ['asset.created'] };
  const hook = await instance.ok(token, 'POST', '/settings/webhooks', input);
  await instance.ok(token, 'PATCH', `/settings/webhooks/${hook.id}`, { ...input, name: 'Powiadomienia 2' });
  await instance.ok(token, 'DELETE', `/settings/webhooks/${hook.id}`);
  const events = await activity();
  assert.ok(events.some(([action, label]) => action === 'webhook.created' && label === 'Powiadomienia'));
  assert.ok(events.some(([action, label]) => action === 'webhook.updated' && label === 'Powiadomienia 2'));
  assert.ok(events.some(([action, label]) => action === 'webhook.deleted' && label === 'Powiadomienia 2'));
});

test('a sign-in lockout is recorded once, not every failed attempt', async () => {
  await instance.ok(token, 'POST', '/household/members', {
    login: 'gosc',
    email: 'gosc@example.test',
    password,
    role: 'member',
  });
  for (let attempt = 0; attempt < 7; attempt++)
    await instance.api(null, 'POST', '/auth/login', { login: 'gosc', password: 'wrong-password-123' });
  // Unknown logins are throttled too, but have no household history to write to.
  for (let attempt = 0; attempt < 6; attempt++)
    await instance.api(null, 'POST', '/auth/login', { login: 'nobody', password: 'wrong-password-123' });
  const locked = (await activity()).filter(([action]) => action === 'login.locked');
  assert.deepEqual(locked, [['login.locked', 'gosc']]);
  assert.match(instance.output(), /Logowanie zablokowane na 15 min: login "nobody"/);
});
