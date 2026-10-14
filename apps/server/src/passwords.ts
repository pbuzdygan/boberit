import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { scrypt, timingSafeEqual, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { userById } from './db/accounts.js';
import { failure } from './http.js';
import { FailureLimiter } from './rate-limit.js';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  return salt.toString('hex') + ':' + (await scryptAsync(password, salt, 64)).toString('hex');
}
export async function verifyPassword(password: unknown, stored: string): Promise<boolean> {
  const [salt, value] = stored.split(':');
  if (typeof password !== 'string' || !salt || !value) return false;
  const actual = await scryptAsync(password, Buffer.from(salt, 'hex'), 64);
  const expected = Buffer.from(value, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
// Unknown logins are checked against this hash, so response time does not reveal which accounts exist.
export const unknownUserHash = passwordHash(randomBytes(16).toString('hex'));
export const loginFailures = new FailureLimiter(5, 15 * 60_000);
const accountFailures = new FailureLimiter(5, 15 * 60_000);
export function clientAddress(c: Context): string {
  // The socket address: behind a reverse proxy all clients share the proxy address.
  return getConnInfo(c).remote.address ?? 'unknown';
}
export function tooManyAttempts(c: Context, seconds: number) {
  c.header('Retry-After', String(seconds));
  return c.json(
    failure(
      `Zbyt wiele nieudanych prób. Spróbuj ponownie za ${Math.ceil(seconds / 60)} min.`,
      429,
      'TOO_MANY_ATTEMPTS',
    ),
    429,
  );
}
// Re-authentication for sensitive actions; failures count towards the same account limit as password changes.
export async function confirmPassword(c: Context, userId: string, password: unknown): Promise<Response | null> {
  const key = 'account:' + userId;
  const wait = accountFailures.retryAfter(key);
  if (wait) return tooManyAttempts(c, wait);
  const record = userById(userId);
  if (record && (await verifyPassword(password, String(record.password_hash)))) {
    accountFailures.reset(key);
    return null;
  }
  accountFailures.fail(key);
  return c.json(failure('Obecne hasło jest nieprawidłowe.', 401, 'INVALID_CREDENTIALS'), 401);
}
