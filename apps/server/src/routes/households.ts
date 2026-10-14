import { Hono } from 'hono';
import {
  createHouseholdMember,
  updateHouseholdMemberRole,
  removeHouseholdMember,
  listUserHouseholds,
  createHouseholdForUser,
  renameHousehold,
  setActiveHousehold,
  listHouseholdMembers,
  userById,
} from '../db/accounts.js';
import { addAuditEvent } from '../db/audit.js';
import { failure, isUniqueViolation, json } from '../http.js';
import { passwordHash } from '../passwords.js';
import { currentUser, tokenHash } from '../session.js';

export const householdsRoutes = new Hono();
householdsRoutes.get('/api/v1/households', (c) => {
  const user = currentUser(c.req.raw);
  return c.json({
    data: {
      activeHouseholdId: user?.household_id ?? null,
      households: user ? listUserHouseholds(String(user.id)) : [],
    },
  });
});
householdsRoutes.post('/api/v1/households', async (c) => {
  const user = currentUser(c.req.raw)!;
  const input = await json<{ name: string }>(c.req.raw);
  if (!input.name?.trim() || input.name.trim().length > 80)
    return c.json(failure('Podaj nazwę gospodarstwa (maks. 80 znaków).'), 400);
  return c.json({ data: createHouseholdForUser(String(user.id), input.name) }, 201);
});
householdsRoutes.patch('/api/v1/households/:id', async (c) => {
  const user = currentUser(c.req.raw)!;
  const input = await json<{ name: string }>(c.req.raw);
  if (!input.name?.trim() || input.name.trim().length > 80)
    return c.json(failure('Podaj nazwę gospodarstwa (maks. 80 znaków).'), 400);
  return renameHousehold(String(user.id), c.req.param('id'), input.name)
    ? c.json({ data: { renamed: true } })
    : c.json(failure('Tylko właściciel może zmienić nazwę gospodarstwa.', 403, 'FORBIDDEN'), 403);
});
householdsRoutes.post('/api/v1/households/active', async (c) => {
  const user = currentUser(c.req.raw);
  const input = await json<{ householdId: string }>(c.req.raw);
  if (!user || !input.householdId || !setActiveHousehold(tokenHash(c.req.raw), String(user.id), input.householdId))
    return c.json(failure('Nie możesz wybrać tego gospodarstwa.', 403, 'FORBIDDEN'), 403);
  return c.json({ data: { activeHouseholdId: input.householdId } });
});
householdsRoutes.get('/api/v1/household/members', (c) => {
  const user = currentUser(c.req.raw);
  if (!user) return c.json(failure('Brak sesji.', 401, 'UNAUTHORIZED'), 401);
  return c.json({
    data: { members: listHouseholdMembers(String(user.household_id)), canManage: user.role === 'owner' },
  });
});
householdsRoutes.post('/api/v1/household/members', async (c) => {
  const admin = currentUser(c.req.raw);
  if (!admin || admin.role !== 'owner')
    return c.json(failure('Tylko właściciel może tworzyć konta.', 403, 'FORBIDDEN'), 403);
  const input = await json<{ login: string; email: string; password: string; role: 'owner' | 'member' }>(c.req.raw);
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(input.login) || !/^\S+@\S+\.\S+$/.test(input.email) || input.password.length < 12)
    return c.json(failure('Podaj poprawny login, e-mail i hasło mające co najmniej 12 znaków.'), 400);
  try {
    const member = createHouseholdMember({
      householdId: String(admin.household_id),
      login: input.login,
      email: input.email,
      passwordHash: await passwordHash(input.password),
      role: input.role === 'owner' ? 'owner' : 'member',
    });
    addAuditEvent({
      householdId: String(admin.household_id),
      userId: String(admin.id),
      action: 'member.added',
      entityKind: 'member',
      entityId: member.id,
      label: member.login,
    });
    return c.json({ data: member }, 201);
  } catch (error) {
    if (isUniqueViolation(error))
      return c.json(failure('Ten login lub adres e-mail jest już używany.', 409, 'CONFLICT'), 409);
    throw error;
  }
});
householdsRoutes.patch('/api/v1/household/members/:id', async (c) => {
  const admin = currentUser(c.req.raw);
  if (!admin || admin.role !== 'owner')
    return c.json(failure('Tylko właściciel może zmieniać role.', 403, 'FORBIDDEN'), 403);
  const input = await json<{ role: 'owner' | 'member' }>(c.req.raw);
  if (input.role !== 'owner' && input.role !== 'member') return c.json(failure('Wybierz poprawną rolę.'), 400);
  const memberId = c.req.param('id');
  if (!updateHouseholdMemberRole(String(admin.household_id), memberId, input.role))
    return c.json(failure('Nie znaleziono członka.', 404, 'NOT_FOUND'), 404);
  addAuditEvent({
    householdId: String(admin.household_id),
    userId: String(admin.id),
    action: input.role === 'owner' ? 'member.promoted' : 'member.demoted',
    entityKind: 'member',
    entityId: memberId,
    label: String(userById(memberId)?.login ?? ''),
  });
  return c.json({ data: { updated: true } });
});
householdsRoutes.delete('/api/v1/household/members/:id', (c) => {
  const admin = currentUser(c.req.raw);
  if (!admin || admin.role !== 'owner')
    return c.json(failure('Tylko właściciel może usuwać członków.', 403, 'FORBIDDEN'), 403);
  const memberId = c.req.param('id');
  if (!removeHouseholdMember(String(admin.household_id), memberId))
    return c.json(failure('Nie znaleziono członka.', 404, 'NOT_FOUND'), 404);
  addAuditEvent({
    householdId: String(admin.household_id),
    userId: String(admin.id),
    action: 'member.removed',
    entityKind: 'member',
    entityId: memberId,
    label: String(userById(memberId)?.login ?? ''),
  });
  return c.body(null, 204);
});
