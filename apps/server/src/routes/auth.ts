import { Hono } from 'hono';
import { createHmac, randomBytes } from 'node:crypto';
import {
  createSession,
  deleteSession,
  deleteOtherSessions,
  updateUserPassword,
  createUserAccount,
  hasUsers,
  listUserHouseholds,
  userByLogin,
} from '../db/accounts.js';
import { addAuditEvent } from '../db/audit.js';
import { failure } from '../http.js';
import { loginInput, passwordChangeInput, registerInput } from '../inputs.js';
import { readBody } from '../validate.js';
import {
  needsRehash,
  passwordHash,
  verifyPassword,
  unknownUserHash,
  loginFailures,
  clientAddress,
  tooManyAttempts,
  confirmPassword,
} from '../passwords.js';
import { encryptionKey } from '../secrets.js';
import { currentUser, tokenHash } from '../session.js';

export const authRoutes = new Hono();
authRoutes.get('/api/v1/auth/me', (c) => {
  const user = currentUser(c.req.raw);
  return user
    ? c.json({
        data: { id: user.id, login: user.login, email: user.email, householdId: user.household_id, role: user.role },
      })
    : c.json(failure('Brak sesji.', 401, 'UNAUTHORIZED'), 401);
});
authRoutes.post('/api/v1/auth/logout', (c) => {
  deleteSession(tokenHash(c.req.raw));
  return c.body(null, 204);
});
authRoutes.post('/api/v1/auth/password', async (c) => {
  const user = currentUser(c.req.raw)!;
  const input = await readBody(c.req.raw, passwordChangeInput);
  const denied = await confirmPassword(c, String(user.id), input.currentPassword);
  if (denied) return denied;
  if (typeof input.newPassword !== 'string' || input.newPassword.length < 12)
    return c.json(failure('Nowe hasło musi mieć co najmniej 12 znaków.'), 400);
  updateUserPassword(String(user.id), await passwordHash(input.newPassword));
  deleteOtherSessions(String(user.id), tokenHash(c.req.raw));
  addAuditEvent({
    householdId: String(user.household_id),
    userId: String(user.id),
    action: 'password.changed',
    entityKind: 'account',
    entityId: String(user.id),
    label: String(user.login),
  });
  return c.json({ data: { changed: true } });
});
authRoutes.post('/api/v1/auth/logout-others', (c) => {
  const user = currentUser(c.req.raw)!;
  const count = deleteOtherSessions(String(user.id), tokenHash(c.req.raw));
  addAuditEvent({
    householdId: String(user.household_id),
    userId: String(user.id),
    action: 'sessions.revoked',
    entityKind: 'account',
    entityId: String(user.id),
    label: String(user.login),
  });
  return c.json({ data: { revoked: count } });
});
authRoutes.get('/api/v1/auth/setup', (c) => c.json({ data: { needsSetup: !hasUsers() } }));
authRoutes.post('/api/v1/auth/register', async (c) => {
  if (hasUsers())
    return c.json(failure('Konfiguracja pierwszego konta została już zakończona.', 409, 'ALREADY_CONFIGURED'), 409);
  const input = await readBody(c.req.raw, registerInput);
  if (
    !/^[a-zA-Z0-9_.-]{3,32}$/.test(input.login) ||
    !/^\S+@\S+\.\S+$/.test(input.email) ||
    input.password.length < 12 ||
    !input.householdName.trim()
  )
    return c.json(
      failure('Podaj login, poprawny e-mail, nazwę gospodarstwa i hasło mające co najmniej 12 znaków.'),
      400,
    );
  const hash = await passwordHash(input.password);
  // Check again after the await: the check and the insert must run without yielding, or concurrent
  // first-run requests could each create an owner account.
  if (hasUsers())
    return c.json(failure('Konfiguracja pierwszego konta została już zakończona.', 409, 'ALREADY_CONFIGURED'), 409);
  const user = createUserAccount({
    login: input.login,
    email: input.email,
    passwordHash: hash,
    householdName: input.householdName.trim(),
  });
  const token = randomBytes(32).toString('hex');
  createSession(user.id, createHmac('sha256', encryptionKey!).update(token).digest('hex'));
  return c.json({ data: { user, token } }, 201);
});
authRoutes.post('/api/v1/auth/login', async (c) => {
  const input = await readBody(c.req.raw, loginInput);
  const address = clientAddress(c);
  const loginKey = address + '|' + input.login.trim().toLowerCase();
  // Throttling is per login, so failed attempts against one account never block anyone else.
  const wait = loginFailures.retryAfter(loginKey);
  if (wait) return tooManyAttempts(c, wait);
  const user = userByLogin(input.login);
  const valid = await verifyPassword(input.password, user ? String(user.password_hash) : await unknownUserHash);
  if (!user || !valid) {
    // Only the start of a block is recorded: logging every failure would let anyone flood the
    // household history. The login is JSON-encoded and truncated so it cannot forge log lines.
    if (loginFailures.fail(loginKey)) {
      console.warn(
        `Logowanie zablokowane na 15 min: login ${JSON.stringify(input.login.slice(0, 64))}, adres ${address}`,
      );
      if (user)
        for (const household of listUserHouseholds(String(user.id)))
          addAuditEvent({
            householdId: String(household.id),
            userId: String(user.id),
            action: 'login.locked',
            entityKind: 'account',
            entityId: String(user.id),
            label: String(user.login),
          });
    }
    return c.json(failure('Nieprawidłowy login lub hasło.', 401, 'INVALID_CREDENTIALS'), 401);
  }
  loginFailures.reset(loginKey);
  // Hashes from older versions are upgraded transparently while the password is at hand.
  if (needsRehash(String(user.password_hash))) updateUserPassword(String(user.id), await passwordHash(input.password));
  const token = randomBytes(32).toString('hex');
  createSession(String(user.id), createHmac('sha256', encryptionKey!).update(token).digest('hex'));
  return c.json({ data: { user: { id: user.id, login: user.login, email: user.email }, token } });
});
