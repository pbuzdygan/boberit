import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { scrypt, timingSafeEqual, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { userById } from './db/accounts.js';
import { failure } from './http.js';
import { FailureLimiter } from './rate-limit.js';

type ScryptCost = { N: number; r: number; p: number };
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptCost & { maxmem: number },
) => Promise<Buffer>;

// OWASP-equivalent scrypt cost (N=2^15, r=8, p=3): 32 MB and roughly 0.2 s per hash. The memory per
// hash stays moderate because unauthenticated sign-ins hash too, up to four at once (libuv pool).
export const currentCost: ScryptCost = { N: 2 ** 15, r: 8, p: 3 };
// Hashes created before the cost was stored use Node's defaults and the format `salt:hash`.
const legacyCost: ScryptCost = { N: 2 ** 14, r: 8, p: 1 };
const keyLength = 64;

function derive(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  return scryptAsync(password, salt, keyLength, { ...cost, maxmem: 256 * cost.N * cost.r + 1024 * 1024 });
}

/** Parses `scrypt$N$r$p$salt$hash` or the legacy `salt:hash`; null when the value is malformed. */
function parseHash(stored: string): { cost: ScryptCost; salt: Buffer; value: Buffer } | null {
  const parts = stored.split('$');
  if (parts[0] === 'scrypt' && parts.length === 6) {
    const [N, r, p] = parts.slice(1, 4).map(Number) as [number, number, number];
    const valid = [N, r, p].every(Number.isSafeInteger) && N >= 2 ** 14 && N <= 2 ** 20 && r >= 1 && r <= 32;
    if (!valid || p < 1 || p > 16 || !parts[4] || !parts[5]) return null;
    return { cost: { N, r, p }, salt: Buffer.from(parts[4], 'hex'), value: Buffer.from(parts[5], 'hex') };
  }
  const [salt, value] = stored.split(':');
  return salt && value ? { cost: legacyCost, salt: Buffer.from(salt, 'hex'), value: Buffer.from(value, 'hex') } : null;
}

export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p } = currentCost;
  return ['scrypt', N, r, p, salt.toString('hex'), (await derive(password, salt, currentCost)).toString('hex')].join(
    '$',
  );
}

export async function verifyPassword(password: unknown, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (typeof password !== 'string' || !parsed) return false;
  const actual = await derive(password, parsed.salt, parsed.cost);
  return actual.length === parsed.value.length && timingSafeEqual(actual, parsed.value);
}

/** True when a stored hash uses weaker parameters than `currentCost` and should be replaced after sign-in. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const { N, r, p } = parsed.cost;
  return N * r * p < currentCost.N * currentCost.r * currentCost.p || N < currentCost.N;
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
