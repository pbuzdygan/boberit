import { type FormEvent, useEffect, useId, useState } from 'react';
import { api } from '../api';
import { avatarInitials } from '../collections';
import { FormSelect } from '../components/FormSelect';
import { Icon } from '../components/Icon';
import { SettingsHeader } from '../components/SettingsBlock';
import { useDialog } from '../hooks/useDialog';

type Role = 'owner' | 'member';
type Member = { id: string; login: string; email: string; role: Role };
const roleOptions = [
  { value: 'member', label: 'Członek' },
  { value: 'owner', label: 'Właściciel' },
];

/** People with access to the active household; owners add members and change roles. */
export function MembersSettings({ currentLogin }: { currentLogin: string | null }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const load = () =>
    void api
      .listMembers()
      .then((r) => {
        setMembers(r.data.members as Member[]);
        setCanManage(r.data.canManage);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się odczytać członków.'));
  useEffect(load, []);

  async function changeRole(id: string, next: Role) {
    try {
      setError('');
      await api.updateMemberRole(id, next);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zmienić roli.');
    }
  }
  async function remove(member: Member) {
    if (
      !window.confirm(
        `Usunąć ${member.login} z tego gospodarstwa? Konto pozostanie zachowane, ale straci dostęp do jego danych.`,
      )
    )
      return;
    try {
      setError('');
      await api.removeMember(member.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć członka.');
    }
  }

  return (
    <>
      <SettingsHeader
        action={
          canManage && (
            <button className="primary" onClick={() => setAdding(true)} type="button">
              <Icon name="plus" /> Dodaj członka
            </button>
          )
        }
        description={
          canManage
            ? 'Osoby z dostępem do tego gospodarstwa. Właściciele zarządzają członkami i kopią zapasową.'
            : 'Osoby z dostępem do tego gospodarstwa. Członkami zarządza właściciel.'
        }
        title="Członkowie"
      />
      {error && <p className="form-error">{error}</p>}
      <ul className="member-list">
        {members.map((member) => {
          const isMe = member.login === currentLogin;
          return (
            <li key={member.id}>
              <span aria-hidden="true" className="member-avatar">
                {avatarInitials(member.login)}
              </span>
              <span className="member-identity">
                <strong>
                  {member.login}
                  {isMe && <span className="you-badge">Ty</span>}
                </strong>
                <small>{member.email}</small>
              </span>
              {canManage && !isMe ? (
                <span className="member-actions">
                  <FormSelect
                    className="member-role-select"
                    hideLabel
                    label={`Rola: ${member.login}`}
                    onChange={(value) => void changeRole(member.id, value as Role)}
                    options={roleOptions}
                    value={member.role}
                  />
                  <button
                    aria-label={`Usuń ${member.login} z gospodarstwa`}
                    className="icon-button icon-button--danger"
                    onClick={() => void remove(member)}
                    title="Usuń z gospodarstwa"
                    type="button"
                  >
                    <Icon name="x" />
                  </button>
                </span>
              ) : (
                <span className="role-badge">{member.role === 'owner' ? 'Właściciel' : 'Członek'}</span>
              )}
            </li>
          );
        })}
      </ul>
      {adding && (
        <AddMemberDialog
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </>
  );
}

function AddMemberDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useDialog<HTMLFormElement>(onClose);
  const titleId = useId();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createMember({ login, email, password, role });
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się utworzyć konta.');
      setBusy(false);
    }
  }
  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        {...dialog}
        aria-labelledby={titleId}
        aria-modal="true"
        className="dialog"
        onSubmit={(event) => void submit(event)}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Członkowie</p>
            <h2 id={titleId}>Dodaj członka</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <Icon label="Zamknij" name="x" />
          </button>
        </header>
        <p className="dialog-intro">Utworzysz konto, którym ta osoba zaloguje się do tego gospodarstwa.</p>
        <div className="form-grid">
          <label>
            Login
            <input autoComplete="off" autoFocus onChange={(e) => setLogin(e.target.value)} required value={login} />
          </label>
          <label>
            E-mail
            <input autoComplete="off" onChange={(e) => setEmail(e.target.value)} required type="email" value={email} />
          </label>
          <label>
            <span>
              Hasło <small>minimum 12 znaków</small>
            </span>
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <FormSelect label="Rola" onChange={(value) => setRole(value as Role)} options={roleOptions} value={role} />
        </div>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button className="secondary" onClick={onClose} type="button">
            Anuluj
          </button>
          <button className="primary" disabled={busy || !login || !email || password.length < 12} type="submit">
            {busy ? 'Tworzenie…' : 'Utwórz konto'}
          </button>
        </footer>
      </form>
    </div>
  );
}
