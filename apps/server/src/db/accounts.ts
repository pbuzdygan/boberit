import { randomUUID } from 'node:crypto';
import { database } from './database.js';
import { type Row, now } from './values.js';

export function hasUsers(): boolean {
  return Number((database.prepare('SELECT COUNT(*) AS count FROM users').get() as Row).count) > 0;
}
export function createUserAccount(input: {
  login: string;
  email: string;
  passwordHash: string;
  householdName: string;
}): { id: string; login: string; email: string; householdId: string } {
  const id = randomUUID(),
    householdId = randomUUID(),
    stamp = now();
  database.exec('BEGIN');
  try {
    database
      .prepare('INSERT INTO users(id,login,email,password_hash,created_at) VALUES(?,?,?,?,?)')
      .run(id, input.login, input.email, input.passwordHash, stamp);
    database
      .prepare('INSERT INTO households(id,name,created_at) VALUES(?,?,?)')
      .run(householdId, input.householdName, stamp);
    database
      .prepare("INSERT INTO household_members(household_id,user_id,role,created_at) VALUES(?,?, 'owner',?)")
      .run(householdId, id, stamp);
    database.prepare('UPDATE assets SET household_id=? WHERE household_id IS NULL').run(householdId);
    database.prepare('UPDATE documents SET household_id=? WHERE household_id IS NULL').run(householdId);
    database.exec('COMMIT');
    return { id, login: input.login, email: input.email, householdId };
  } catch (e) {
    database.exec('ROLLBACK');
    throw e;
  }
}
export function userByLogin(login: string): Row | undefined {
  return database.prepare('SELECT * FROM users WHERE login=? OR email=?').get(login, login) as Row | undefined;
}

export function createHouseholdMember(input: {
  householdId: string;
  login: string;
  email: string;
  passwordHash: string;
  role: 'owner' | 'member';
}): { id: string; login: string; email: string; role: string } {
  const id = randomUUID(),
    stamp = now();
  database.exec('BEGIN');
  try {
    database
      .prepare('INSERT INTO users(id,login,email,password_hash,created_at) VALUES(?,?,?,?,?)')
      .run(id, input.login, input.email, input.passwordHash, stamp);
    database
      .prepare('INSERT INTO household_members(household_id,user_id,role,created_at) VALUES(?,?,?,?)')
      .run(input.householdId, id, input.role, stamp);
    database.exec('COMMIT');
    return { id, login: input.login, email: input.email, role: input.role };
  } catch (e) {
    database.exec('ROLLBACK');
    throw e;
  }
}
export function listHouseholdMembers(householdId: string): Row[] {
  return database
    .prepare(
      'SELECT u.id,u.login,u.email,m.role,m.created_at FROM household_members m JOIN users u ON u.id=m.user_id WHERE m.household_id=? ORDER BY m.created_at',
    )
    .all(householdId) as Row[];
}
export function updateHouseholdMemberRole(householdId: string, userId: string, role: 'owner' | 'member'): boolean {
  const current = database
    .prepare('SELECT role FROM household_members WHERE household_id=? AND user_id=?')
    .get(householdId, userId) as Row | undefined;
  if (!current) return false;
  if (String(current.role) === 'owner' && role === 'member') {
    const owners = database
      .prepare("SELECT COUNT(*) AS count FROM household_members WHERE household_id=? AND role='owner'")
      .get(householdId) as Row;
    if (Number(owners.count) <= 1) throw new Error('Gospodarstwo musi mieć co najmniej jednego właściciela.');
  }
  return (
    database
      .prepare('UPDATE household_members SET role=? WHERE household_id=? AND user_id=?')
      .run(role, householdId, userId).changes > 0
  );
}
export function removeHouseholdMember(householdId: string, userId: string): boolean {
  const current = database
    .prepare('SELECT role FROM household_members WHERE household_id=? AND user_id=?')
    .get(householdId, userId) as Row | undefined;
  if (!current) return false;
  if (String(current.role) === 'owner') {
    const owners = database
      .prepare("SELECT COUNT(*) AS count FROM household_members WHERE household_id=? AND role='owner'")
      .get(householdId) as Row;
    if (Number(owners.count) <= 1) throw new Error('Nie można usunąć ostatniego właściciela gospodarstwa.');
  }
  return (
    database.prepare('DELETE FROM household_members WHERE household_id=? AND user_id=?').run(householdId, userId)
      .changes > 0
  );
}

export function sessionUser(tokenHash: string): Row | undefined {
  return database
    .prepare(
      'SELECT u.id,u.login,u.email,m.household_id,m.role FROM sessions s JOIN users u ON u.id=s.user_id JOIN household_members m ON m.user_id=u.id AND m.household_id=s.active_household_id WHERE s.token_hash=? AND s.expires_at>?',
    )
    .get(tokenHash, now()) as Row | undefined;
}
export function listUserHouseholds(userId: string): Row[] {
  return database
    .prepare(
      'SELECT h.id,h.name,m.role FROM household_members m JOIN households h ON h.id=m.household_id WHERE m.user_id=? ORDER BY h.name',
    )
    .all(userId) as Row[];
}
export function createHouseholdForUser(userId: string, name: string): Row {
  const id = randomUUID(),
    stamp = now();
  database.exec('BEGIN');
  try {
    database.prepare('INSERT INTO households(id,name,created_at) VALUES(?,?,?)').run(id, name.trim(), stamp);
    database
      .prepare("INSERT INTO household_members(household_id,user_id,role,created_at) VALUES(?,?, 'owner',?)")
      .run(id, userId, stamp);
    database.exec('COMMIT');
    return { id, name: name.trim(), role: 'owner' };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
export function renameHousehold(userId: string, householdId: string, name: string): boolean {
  return (
    database
      .prepare(
        "UPDATE households SET name=? WHERE id=? AND EXISTS(SELECT 1 FROM household_members WHERE household_id=? AND user_id=? AND role='owner')",
      )
      .run(name.trim(), householdId, householdId, userId).changes > 0
  );
}
export function setActiveHousehold(tokenHash: string, userId: string, householdId: string): boolean {
  return (
    database
      .prepare(
        'UPDATE sessions SET active_household_id=? WHERE token_hash=? AND user_id=? AND EXISTS(SELECT 1 FROM household_members WHERE user_id=? AND household_id=?)',
      )
      .run(householdId, tokenHash, userId, userId, householdId).changes > 0
  );
}
export function createSession(userId: string, tokenHash: string): string {
  const id = randomUUID(),
    expires = new Date(Date.now() + 30 * 86400000).toISOString();
  const member = database
    .prepare('SELECT household_id FROM household_members WHERE user_id=? ORDER BY created_at LIMIT 1')
    .get(userId) as Row | undefined;
  database
    .prepare(
      'INSERT INTO sessions(id,user_id,token_hash,active_household_id,expires_at,created_at) VALUES(?,?,?,?,?,?)',
    )
    .run(id, userId, tokenHash, (member?.household_id as string | undefined) ?? null, expires, now());
  return expires;
}
export function deleteSession(tokenHash: string): boolean {
  return database.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash).changes > 0;
}
export function deleteOtherSessions(userId: string, tokenHash: string): number {
  return database.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(userId, tokenHash)
    .changes as number;
}
export function userById(id: string): Row | undefined {
  return database.prepare('SELECT * FROM users WHERE id=?').get(id) as Row | undefined;
}
export function updateUserPassword(id: string, passwordHash: string): void {
  database.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, id);
}
