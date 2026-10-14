import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Hono } from 'hono';
import { errorResponse, isUniqueViolation, PublicError } from '../src/http.ts';
import { password, registerOwner, startTestServer } from './server-fixture.mjs';

describe('error responses', () => {
  const app = new Hono();
  app.get('/public', () => {
    throw new PublicError('Nazwa jest wymagana.');
  });
  app.get('/conflict', () => {
    throw new PublicError('Już istnieje.', 409, 'CONFLICT');
  });
  app.get('/internal', () => {
    throw new Error('UNIQUE constraint failed: users.login at /data/boberit.db');
  });
  app.onError(errorResponse);

  test('public errors keep their message and status', async () => {
    const response = await app.request('/public');
    assert.equal(response.status, 400);
    assert.deepEqual((await response.json()).error, { code: 'VALIDATION_ERROR', message: 'Nazwa jest wymagana.' });
    assert.equal((await app.request('/conflict')).status, 409);
  });

  test('unexpected errors become a generic 500 without internal details', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    const response = await app.request('/internal');
    assert.equal(response.status, 500);
    const text = await response.text();
    assert.match(text, /Nieoczekiwany błąd serwera\./);
    assert.doesNotMatch(text, /UNIQUE|constraint|\/data/);
    assert.equal(console.error.mock.callCount(), 1);
  });

  test('unique violations are recognised by SQLite result code', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const database = new DatabaseSync(':memory:');
    database.exec('CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT UNIQUE, note TEXT NOT NULL)');
    database.exec("INSERT INTO t VALUES ('1', 'a', 'x')");
    const errorOf = (sql) => {
      try {
        database.exec(sql);
      } catch (error) {
        return error;
      }
      return null;
    };
    assert.equal(isUniqueViolation(errorOf("INSERT INTO t VALUES ('2', 'a', 'x')")), true);
    assert.equal(isUniqueViolation(errorOf("INSERT INTO t VALUES ('1', 'b', 'x')")), true);
    assert.equal(isUniqueViolation(errorOf("INSERT INTO t VALUES ('3', 'c', NULL)")), false);
    assert.equal(isUniqueViolation(new Error('UNIQUE constraint failed')), false);
    database.close();
  });
});

describe('HTTP hardening on a running server', () => {
  let instance;
  let token;

  before(async () => {
    instance = await startTestServer();
    token = await registerOwner(instance);
  });
  after(() => instance?.stop());

  test('the app shell and API send security headers and a script-restricting CSP', async () => {
    for (const path of ['/', '/api/v1/health']) {
      const response = await fetch(instance.baseUrl + path);
      const csp = response.headers.get('content-security-policy') ?? '';
      assert.match(csp, /default-src 'self'/, path);
      assert.match(csp, /script-src 'self'(;|$)/, path);
      assert.match(csp, /object-src 'none'/, path);
      assert.match(csp, /frame-ancestors 'none'/, path);
      assert.equal(response.headers.get('x-frame-options'), 'DENY', path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer', path);
      // HSTS belongs to the TLS-terminating proxy, not to an app that may run on plain HTTP.
      assert.equal(response.headers.get('strict-transport-security'), null, path);
    }
  });

  test('the API does not grant cross-origin access', async () => {
    const origin = { Origin: 'https://evil.example' };
    const simple = await instance.api(token, 'GET', '/assets', undefined, origin);
    assert.equal(simple.status, 200);
    assert.equal(simple.headers.get('access-control-allow-origin'), null);
    const preflight = await fetch(`${instance.baseUrl}/api/v1/assets`, {
      method: 'OPTIONS',
      headers: {
        ...origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
    assert.equal(preflight.headers.get('access-control-allow-headers'), null);
  });

  test('validation failures use HTTP 400, not 200', async () => {
    const member = await instance.api(token, 'POST', '/household/members', {});
    assert.equal(member.status, 400);
    assert.equal(member.error.code, 'VALIDATION_ERROR');
    const invalid = await instance.api(token, 'POST', '/assets', '{', { 'Content-Type': 'application/json' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.error.message, 'Nieprawidłowy JSON.');
    const empty = await instance.api(token, 'POST', '/assets', { name: ' ' });
    assert.equal(empty.status, 400);
    assert.equal(empty.error.message, 'Nazwa przedmiotu jest wymagana.');
  });

  test('a duplicate login returns a public conflict message instead of SQLite text', async () => {
    const result = await instance.api(token, 'POST', '/household/members', {
      login: 'owner',
      email: 'other@example.test',
      password,
      role: 'member',
    });
    assert.equal(result.status, 409);
    assert.equal(result.error.message, 'Ten login lub adres e-mail jest już używany.');
    assert.doesNotMatch(result.text, /UNIQUE|constraint|users\./);
  });

  test('a duplicate dictionary entry keeps its friendly message', async () => {
    await instance.ok(token, 'POST', '/household/asset-options', { kind: 'location', name: 'Kuchnia' });
    const result = await instance.api(token, 'POST', '/household/asset-options', { kind: 'location', name: 'kuchnia' });
    assert.equal(result.status, 400);
    assert.equal(result.error.message, 'Taka pozycja już istnieje.');
  });

  test('uploads must match their declared type', async () => {
    const document = await instance.ok(token, 'POST', '/documents', { name: 'Typy' });
    const upload = (name, content, type) => {
      const form = new FormData();
      form.set('file', new File([content], name, { type }));
      return instance.api(token, 'POST', `/documents/${document.id}/files`, form);
    };
    for (const [name, content, type] of [
      ['skan.pdf', '<html><script>alert(1)</script></html>', 'application/pdf'],
      ['umowa.docx', 'not a zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['notatka.txt', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 1]), 'text/plain'],
    ]) {
      const result = await upload(name, content, type);
      assert.equal(result.status, 400, name);
      assert.equal(result.error.message, 'Zawartość pliku nie pasuje do jego typu.', name);
    }
    assert.equal((await upload('ok.pdf', '%PDF-1.4\n%%EOF', 'application/pdf')).status, 201);

    // libvips can read SVG; a mislabeled SVG must be stored as the re-encoded PNG, never as SVG.
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>';
    const stored = await upload('rysunek.png', svg, 'image/png');
    assert.equal(stored.status, 201, stored.text);
    const download = await fetch(`${instance.baseUrl}/api/v1/files/${stored.data.id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const head = Buffer.from(await download.arrayBuffer()).subarray(0, 8);
    assert.ok(
      head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
        head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
      `stored bytes start with ${head.toString('hex')}`,
    );
  });

  test('a failed OCR run stores a generic reason without tool output or paths', async () => {
    const document = await instance.ok(token, 'POST', '/documents', { name: 'Skan' });
    const form = new FormData();
    form.set('file', new File(['%PDF-1.4 broken'], 'skan.pdf', { type: 'application/pdf' }));
    await instance.ok(token, 'POST', `/documents/${document.id}/files`, form);
    await instance.api(token, 'POST', `/documents/${document.id}/ocr`);
    const ocr = await instance.ok(token, 'GET', `/documents/${document.id}/ocr`);
    assert.equal(ocr.status, 'failed');
    assert.equal(ocr.error, 'Nie udało się rozpoznać tekstu.');
  });
});
