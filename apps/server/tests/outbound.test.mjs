import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { isBlockedAddress, postWebhook, webhookUrlError } from '../src/outbound.ts';

test('local, reserved and private addresses are blocked by default', () => {
  for (const address of [
    '127.0.0.1',
    '0.0.0.0',
    '169.254.169.254',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.10',
    '100.64.0.1',
    '::1',
    'fe80::1',
    'fd12::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])
    assert.ok(isBlockedAddress(address), address);
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.ok(!isBlockedAddress(address), address);
});

test('private networks can be allowed, loopback and metadata never', () => {
  process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'true';
  try {
    assert.ok(!isBlockedAddress('192.168.1.10'));
    assert.ok(isBlockedAddress('127.0.0.1'));
    assert.ok(isBlockedAddress('169.254.169.254'));
  } finally {
    delete process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS;
  }
});

test('webhook URLs are validated before they are saved', async () => {
  assert.ok(await webhookUrlError('ftp://example.com/hook'));
  assert.ok(await webhookUrlError('http://user:secret@example.com/hook'));
  assert.ok(await webhookUrlError('http://127.0.0.1:8080/hook'));
  assert.ok(await webhookUrlError('http://[::1]/hook'));
  assert.ok(await webhookUrlError('http://2130706433/hook'), 'numeric IPv4 form');
  assert.ok(await webhookUrlError('http://localhost/hook'), 'host names are resolved');
  assert.equal(await webhookUrlError('https://1.1.1.1/hook'), null);
});

test('deliveries never connect to blocked addresses, also through DNS', async () => {
  let hits = 0;
  const server = createServer((request, response) => {
    hits += 1;
    response.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await assert.rejects(postWebhook(`http://127.0.0.1:${port}/hook`, {}, '{}'));
    await assert.rejects(postWebhook(`http://localhost:${port}/hook`, {}, '{}'));
    assert.equal(hits, 0);
  } finally {
    server.close();
  }
});
