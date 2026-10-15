import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { password, registerOwner, startTestServer } from './server-fixture.mjs';

// A local receiver stands in for the webhook endpoint. Loopback is always blocked for webhooks,
// so it listens on a private interface address, allowed here by WEBHOOK_ALLOW_PRIVATE_NETWORKS.
const privateAddress = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry && entry.family === 'IPv4' && !entry.internal)?.address;
const received = [];
const receiver = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => {
    received.push({ headers: request.headers, body });
    response.writeHead(204).end();
  });
});
const env = { WEBHOOK_ALLOW_PRIVATE_NETWORKS: 'true' };
const dataDirectory = mkdtempSync(join(tmpdir(), 'boberit-webhooks-'));
let receiverUrl;

before(async () => {
  if (!privateAddress) return;
  await new Promise((resolve) => receiver.listen(0, privateAddress, resolve));
  receiverUrl = `http://${privateAddress}:${receiver.address().port}/hook`;
});
after(() => {
  receiver.close();
  rmSync(dataDirectory, { recursive: true, force: true });
});

async function waitFor(condition, label) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const value = await condition();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

test(
  'a webhook secret that cannot be decrypted records a delivery error instead of failing the request',
  {
    skip: !privateAddress && 'no non-loopback IPv4 interface for the test receiver',
  },
  async () => {
    const first = await startTestServer({ env, dataDirectory, encryptionKey: randomBytes(32).toString('hex') });
    try {
      const token = await registerOwner(first);
      await first.ok(token, 'POST', '/settings/webhooks', {
        name: 'Odbiornik',
        url: receiverUrl,
        secret: 'top-secret',
        events: ['asset.created'],
      });
      await first.ok(token, 'POST', '/assets', { name: 'Czajnik' });
      const delivered = await waitFor(() => received[0], 'the signed delivery');
      const expected = 'sha256=' + createHmac('sha256', 'top-secret').update(delivered.body).digest('hex');
      assert.equal(delivered.headers['x-boberit-signature'], expected);
    } finally {
      await first.stop();
    }

    // The same data with a different APP_ENC_KEY, as after an accidental key change.
    const second = await startTestServer({ env, dataDirectory, encryptionKey: randomBytes(32).toString('hex') });
    try {
      const { token } = await second.ok(null, 'POST', '/auth/login', { login: 'owner', password });
      const created = await second.api(token, 'POST', '/assets', { name: 'Toster' });
      assert.equal(created.status, 201, created.text);
      const deliveries = await waitFor(async () => {
        const list = await second.ok(token, 'GET', '/settings/webhook-deliveries');
        return list.length >= 2 ? list : null;
      }, 'the failed delivery record');
      assert.equal(deliveries[0].status, null);
      assert.match(deliveries[0].error, /APP_ENC_KEY/);
      // An unsigned request must not be sent in place of a signed one.
      assert.equal(received.length, 1);
    } finally {
      await second.stop();
    }
  },
);
