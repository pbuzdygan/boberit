import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUpdateChecker, releaseVersion } from '../src/updates.ts';

const release = (tag, prerelease = false) => ({ tag_name: tag, prerelease, draft: false });
const json = (value) => Response.json(value);

function fixture({ releases = [release('0.2.0')], manifestStatus = 200, version = '0.1.0', channel = 'main' } = {}) {
  let time = Date.parse('2026-10-15T10:00:00Z');
  const calls = [];
  const checker = createUpdateChecker({
    version,
    channel,
    now: () => time,
    fetch: async (url, init) => {
      calls.push({ url, init });
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal instanceof AbortSignal);
      if (url.startsWith('https://api.github.com/')) return json(releases);
      if (url.startsWith('https://ghcr.io/token?')) return json({ token: 'YW5vbnltb3VzLXB1bGwtdG9rZW4=' });
      assert.match(url, /^https:\/\/ghcr.io\/v2\/pbuzdygan\/boberit\/manifests\/(dev)?\d+\.\d+\.\d+$/);
      assert.equal(init.method, 'HEAD');
      return new Response(null, { status: manifestStatus });
    },
  });
  return {
    checker,
    calls,
    advance: () => {
      time += 60_001;
    },
  };
}

test('release tags are validated and main and dev remain separate', () => {
  assert.deepEqual(releaseVersion('0.2.0', 'main'), [0, 2, 0]);
  assert.deepEqual(releaseVersion('dev0.2.0', 'dev'), [0, 2, 0]);
  for (const invalid of ['dev0.2.0', 'v0.2.0', '00.2.0', '0.2.0/evil', '0.2.0-rc.1', '9999999.0.0'])
    assert.equal(releaseVersion(invalid, 'main'), null);
  assert.equal(releaseVersion('0.2.0', 'dev'), null);
});

test('checks the highest matching version numerically, ignores drafts and other channels', async () => {
  const { checker, calls } = fixture({
    releases: [
      release('dev9.0.0', true),
      { ...release('8.0.0'), draft: true },
      release('0.2.0'),
      release('0.10.0'),
      release('0.3.0'),
      release('../../evil'),
    ],
  });
  const result = await checker.check();
  assert.equal(result.status, 'available');
  assert.equal(result.latestVersion, '0.10.0');
  assert.equal(result.releaseUrl, 'https://github.com/pbuzdygan/boberit/releases/tag/0.10.0');
  assert.equal(result.checkedAt, '2026-10-15T10:00:00.000Z');
  assert.equal(calls.length, 3);
});

test('dev checks prereleases only', async () => {
  const { checker } = fixture({
    channel: 'dev',
    version: 'dev0.2.0',
    releases: [release('5.0.0'), release('dev0.3.0', true), release('dev4.0.0')],
  });
  assert.equal((await checker.check()).latestVersion, 'dev0.3.0');
});

test('current and ahead installations do not query the registry', async () => {
  for (const [version, expected] of [
    ['0.2.0', 'current'],
    ['0.3.0', 'ahead'],
  ]) {
    const { checker, calls } = fixture({ version });
    assert.equal((await checker.check()).status, expected);
    assert.equal(calls.length, 1);
  }
});

test('a published release with no container image is preparing, not available', async () => {
  const { checker } = fixture({ manifestStatus: 404 });
  assert.equal((await checker.check()).status, 'preparing');
});

test('concurrent checks share one request and cached results expire after one minute', async () => {
  const { checker, calls, advance } = fixture();
  await Promise.all([checker.check(), checker.check(), checker.check()]);
  await checker.check();
  assert.equal(calls.length, 3);
  advance();
  await checker.check();
  assert.equal(calls.length, 6);
});

test('local or invalid metadata never triggers external requests', async () => {
  for (const options of [
    {},
    { version: 'local', channel: 'main' },
    { version: '0.2.0', channel: 'dev' },
    { version: '0.2.0', channel: 'other' },
  ]) {
    const checker = createUpdateChecker({
      ...options,
      fetch: () => {
        assert.fail('unexpected external request');
      },
    });
    assert.equal((await checker.check()).version, null);
    assert.equal((await checker.check()).status, 'unchecked');
  }
});

test('remote failures are cached, keep the last successful timestamp, and never claim current', async () => {
  let time = 0;
  let fail = false;
  let calls = 0;
  const checker = createUpdateChecker({
    version: '0.2.0',
    channel: 'main',
    now: () => time,
    fetch: async () => {
      calls++;
      if (fail) throw new Error('private remote details');
      return json([release('0.2.0')]);
    },
  });
  const success = await checker.check();
  fail = true;
  time += 60_001;
  const failure = await checker.check();
  assert.equal(failure.status, 'error');
  assert.equal(failure.checkedAt, success.checkedAt);
  assert.doesNotMatch(JSON.stringify(failure), /private remote details/);
  await checker.check();
  assert.equal(calls, 2);
});

test('rate limits, redirects, malformed and oversized responses fail safely', async () => {
  for (const response of [
    new Response(null, { status: 429 }),
    new Response(null, { status: 302 }),
    new Response('{'),
    json({}),
    json([]),
    new Response(' '.repeat(2 * 1024 * 1024 + 1)),
  ]) {
    const checker = createUpdateChecker({ version: '0.2.0', channel: 'main', fetch: async () => response });
    const result = await checker.check();
    assert.equal(result.status, 'error');
    assert.equal(result.checkedAt, null);
  }
  const { checker } = fixture({ manifestStatus: 503 });
  assert.equal((await checker.check()).status, 'error');
});
