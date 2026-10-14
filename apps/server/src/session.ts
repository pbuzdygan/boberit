import type { Context, MiddlewareHandler } from 'hono';
import { createHmac } from 'node:crypto';
import { sessionUser } from './db/accounts.js';
import { failure } from './http.js';
import { encryptionKey } from './secrets.js';

// Rejects API requests without a valid session, except the public health and sign-in endpoints.
export const requireSession: MiddlewareHandler = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (
    path === '/api/v1/health' ||
    path === '/api/v1/auth/setup' ||
    path === '/api/v1/auth/register' ||
    path === '/api/v1/auth/login'
  )
    return next();
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/, '');
  if (!token) return c.json(failure('Zaloguj się, aby użyć API.', 401, 'UNAUTHORIZED'), 401);
  const user = sessionUser(createHmac('sha256', encryptionKey!).update(token).digest('hex'));
  if (!user) return c.json(failure('Sesja wygasła lub jest nieprawidłowa.', 401, 'UNAUTHORIZED'), 401);
  return next();
};
export function requireOwner(c: Context, message: string) {
  const user = currentUser(c.req.raw);
  return user?.role === 'owner'
    ? { user, denied: null }
    : { user: null, denied: c.json(failure(message, 403, 'FORBIDDEN'), 403) };
}
export function currentUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/, '');
  return token ? sessionUser(createHmac('sha256', encryptionKey!).update(token).digest('hex')) : undefined;
}
export function householdId(request: Request): string {
  const user = currentUser(request);
  if (!user?.household_id) throw new Error('Nie wybrano aktywnego gospodarstwa.');
  return String(user.household_id);
}
export function tokenHash(request: Request): string {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/, '');
  return createHmac('sha256', encryptionKey!)
    .update(token ?? '')
    .digest('hex');
}
