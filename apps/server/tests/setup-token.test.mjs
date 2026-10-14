import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { generateSetupToken, initSetupToken, setupTokenMatches } from '../src/setup-token.ts';
import { password, startTestServer } from './server-fixture.mjs';

const dataDirectory = mkdtempSync(join(tmpdir(), 'boberit-setup-'));
after(() => rmSync(dataDirectory, { recursive: true, force: true }));

test('generated codes are readable and random', () => {
  const code = generateSetupToken();
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.notEqual(generateSetupToken(), code);
});

test('a configured code must be long enough and is compared without case, spaces, or dashes', () => {
  assert.throws(() => initSetupToken('short-code'), /SETUP_TOKEN/);
  assert.equal(initSetupToken('Abcd-Efgh-Jkmn'), null);
  assert.equal(setupTokenMatches('ABCDEFGHJKMN'), true);
  assert.equal(setupTokenMatches(' abcd efgh jkmn '), true);
  assert.equal(setupTokenMatches('ABCDEFGHJKMX'), false);
  assert.equal(setupTokenMatches(undefined), false);
});

test('the first account needs the code printed in the server log', async () => {
  const account = { login: 'owner', email: 'owner@example.test', password, householdName: 'Dom' };
  const first = await startTestServer({ dataDirectory, env: { SETUP_TOKEN: '' } });
  try {
    const code = /Kod pierwszej konfiguracji: ([A-Z0-9-]+)/.exec(first.output())?.[1];
    assert.ok(code, first.output());

    const missing = await first.api(null, 'POST', '/auth/register', account);
    assert.equal(missing.status, 400);
    assert.equal(missing.error.message, 'Pole „Kod konfiguracji” jest wymagane.');
    const wrong = await first.api(null, 'POST', '/auth/register', { ...account, setupToken: 'AAAA-AAAA-AAAA-AAAA' });
    assert.equal(wrong.status, 403);
    assert.match(wrong.error.message, /logu serwera/);
    assert.equal((await first.ok(null, 'GET', '/auth/setup')).needsSetup, true);

    const created = await first.api(null, 'POST', '/auth/register', {
      ...account,
      setupToken: code.toLowerCase().replaceAll('-', ' '),
    });
    assert.equal(created.status, 201, created.text);
    const again = await first.api(null, 'POST', '/auth/register', { ...account, login: 'second', setupToken: code });
    assert.equal(again.status, 409);
  } finally {
    await first.stop();
  }

  // Once an account exists, no code is generated or printed.
  const restarted = await startTestServer({ dataDirectory, env: { SETUP_TOKEN: '' } });
  try {
    assert.doesNotMatch(restarted.output(), /Kod pierwszej konfiguracji/);
  } finally {
    await restarted.stop();
  }
});
