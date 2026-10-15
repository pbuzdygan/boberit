import { useEffect, useState } from 'react';
import { api } from '../api';
import { FormSelect } from '../components/FormSelect';
import { Icon } from '../components/Icon';

export function MembersSettings() {
  const [members, setMembers] = useState<{ id: string; login: string; email: string; role: 'owner' | 'member' }[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'owner' | 'member'>('member');
  const [error, setError] = useState('');
  const load = () =>
    void api
      .listMembers()
      .then((r) => {
        setMembers(r.data.members as typeof members);
        setCanManage(r.data.canManage);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się odczytać członków.'));
  useEffect(load, []);
  async function save() {
    try {
      await api.createMember({ login, email, password, role });
      setLogin('');
      setEmail('');
      setPassword('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się utworzyć konta.');
    }
  }
  async function changeRole(id: string, next: 'owner' | 'member') {
    try {
      await api.updateMemberRole(id, next);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zmienić roli.');
    }
  }
  async function remove(id: string, memberLogin: string) {
    if (
      !window.confirm(
        `Usunąć ${memberLogin} z tego gospodarstwa? Konto pozostanie zachowane, ale straci dostęp do jego danych.`,
      )
    )
      return;
    try {
      await api.removeMember(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć członka.');
    }
  }
  return (
    <section className="settings-card">
      <span>
        <Icon name="package" />
      </span>
      <div>
        <p className="eyebrow">Gospodarstwo domowe</p>
        <h2>Członkowie</h2>
        {canManage && (
          <>
            <div className="settings-form">
              <label>
                Login
                <input autoComplete="off" value={login} onChange={(e) => setLogin(e.target.value)} />
              </label>
              <label>
                E-mail
                <input autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
              </label>
              <label>
                <span>
                  Hasło <small>minimum 12 znaków</small>
                </span>
                <input
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                />
              </label>
              <FormSelect
                label="Rola"
                value={role}
                onChange={(value) => setRole(value as 'owner' | 'member')}
                options={[
                  { value: 'member', label: 'Członek' },
                  { value: 'owner', label: 'Właściciel' },
                ]}
              />
            </div>
            <button
              className="secondary"
              disabled={!login || !email || password.length < 12}
              onClick={() => void save()}
              type="button"
            >
              Utwórz konto
            </button>
          </>
        )}
        {!canManage && <p>Role i dostęp do tego gospodarstwa zarządza jego właściciel.</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="webhook-list">
          {members.map((m) => (
            <div key={m.id}>
              <strong>{m.login}</strong>
              <small>
                {m.email} · {m.role === 'owner' ? 'Właściciel' : 'Członek'}
              </small>
              {canManage && (
                <span className="member-actions">
                  <FormSelect
                    className="member-role-select"
                    hideLabel
                    label={`Rola ${m.login}`}
                    value={m.role}
                    onChange={(value) => void changeRole(m.id, value as 'owner' | 'member')}
                    options={[
                      { value: 'member', label: 'Członek' },
                      { value: 'owner', label: 'Właściciel' },
                    ]}
                  />
                  <button
                    className="text-action danger-action"
                    onClick={() => void remove(m.id, m.login)}
                    type="button"
                  >
                    Usuń z gospodarstwa
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
