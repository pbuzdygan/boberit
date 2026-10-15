import { type FormEvent, useState } from 'react';
import { api } from '../api';
import { SettingsBlock, SettingsHeader } from '../components/SettingsBlock';

type Notice = { kind: 'success' | 'error'; text: string } | null;

/** The signed-in account: identity, password, and other signed-in devices. */
export function SecuritySettings({ account }: { account: { login: string; email: string } | null }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [sessionNotice, setSessionNotice] = useState<Notice>(null);

  async function change(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setPasswordNotice(null);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setPasswordNotice({ kind: 'success', text: 'Hasło zmieniono. Pozostałe sesje zostały wylogowane.' });
    } catch (e) {
      setPasswordNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Nie udało się zmienić hasła.' });
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    setSessionNotice(null);
    try {
      const r = await api.logoutOthers();
      setSessionNotice({ kind: 'success', text: `Wylogowano inne sesje: ${r.data.revoked}.` });
    } catch (e) {
      setSessionNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Nie udało się wylogować sesji.' });
    }
  }
  const notice = (value: Notice) =>
    value && (
      <p className={value.kind === 'error' ? 'form-error' : 'form-success'} role="status">
        {value.text}
      </p>
    );

  return (
    <>
      <SettingsHeader description="Dane logowania i urządzenia, na których jesteś zalogowany." title="Bezpieczeństwo" />
      <SettingsBlock title="Konto">
        <dl className="settings-facts">
          <div>
            <dt>Login</dt>
            <dd>{account?.login ?? '—'}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>{account?.email ?? '—'}</dd>
          </div>
        </dl>
      </SettingsBlock>
      <SettingsBlock description="Po zmianie hasła pozostałe urządzenia zostaną wylogowane." title="Hasło">
        <form className="settings-form" onSubmit={(event) => void change(event)}>
          <label>
            Obecne hasło
            <input
              autoComplete="current-password"
              onChange={(e) => setCurrent(e.target.value)}
              type="password"
              value={current}
            />
          </label>
          <label>
            <span>
              Nowe hasło <small>minimum 12 znaków</small>
            </span>
            <input autoComplete="new-password" onChange={(e) => setNext(e.target.value)} type="password" value={next} />
          </label>
          <div className="span-all">
            <button className="secondary" disabled={busy || !current || next.length < 12} type="submit">
              {busy ? 'Zmienianie…' : 'Zmień hasło'}
            </button>
          </div>
        </form>
        {notice(passwordNotice)}
      </SettingsBlock>
      <SettingsBlock
        action={
          <button className="secondary" onClick={() => void revoke()} type="button">
            Wyloguj inne urządzenia
          </button>
        }
        description="Zakończ sesje na innych komputerach i telefonach. To urządzenie pozostanie zalogowane."
        title="Sesje"
      >
        {notice(sessionNotice)}
      </SettingsBlock>
    </>
  );
}
