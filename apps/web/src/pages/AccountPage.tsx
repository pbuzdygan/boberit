import { useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import type { AccountSection } from '../types';
import { HouseholdSettings } from './HouseholdSettings';
import { MembersSettings } from './MembersSettings';
import { WebhookSettings } from './WebhookSettings';

export function AccountPage({
  section,
  onSection,
  onLogout,
}: {
  section: AccountSection;
  onSection: (section: AccountSection) => void;
  onLogout: () => Promise<void>;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Profil użytkownika</p>
          <h1>Moje konto</h1>
          <p>Zarządzaj gospodarstwami, dostępem użytkowników i bezpieczeństwem konta.</p>
        </div>
      </div>
      <div className="account-settings-layout">
        <nav aria-label="Sekcje konta" className="account-settings-nav">
          <p>Gospodarstwa domowe</p>
          <button
            className={section === 'households' ? 'active' : ''}
            onClick={() => onSection('households')}
            type="button"
          >
            <Icon name="home" />
            Gospodarstwa
          </button>
          <button className={section === 'members' ? 'active' : ''} onClick={() => onSection('members')} type="button">
            <Icon name="package" />
            Członkowie
          </button>
          <p>Konto i integracje</p>
          <button
            className={section === 'security' ? 'active' : ''}
            onClick={() => onSection('security')}
            type="button"
          >
            <Icon name="shield-check" />
            Bezpieczeństwo
          </button>
          <button
            className={section === 'webhooks' ? 'active' : ''}
            onClick={() => onSection('webhooks')}
            type="button"
          >
            <Icon name="dots" />
            Webhooki
          </button>
        </nav>
        <div className="account-settings-content">
          {section === 'households' ? (
            <HouseholdSettings />
          ) : section === 'members' ? (
            <MembersSettings />
          ) : section === 'security' ? (
            <SecuritySettings onLogout={onLogout} />
          ) : (
            <WebhookSettings />
          )}
        </div>
      </div>
    </>
  );
}

function SecuritySettings({ onLogout }: { onLogout: () => Promise<void> }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  async function change() {
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setNotice({ kind: 'success', text: 'Hasło zmieniono. Pozostałe sesje zostały wylogowane.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Nie udało się zmienić hasła.' });
    }
  }
  async function revoke() {
    try {
      const r = await api.logoutOthers();
      setNotice({ kind: 'success', text: `Wylogowano ${r.data.revoked} innych sesji.` });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Nie udało się wylogować sesji.' });
    }
  }
  return (
    <section className="settings-card">
      <span>
        <Icon name="shield-check" />
      </span>
      <div>
        <p className="eyebrow">Bezpieczeństwo konta</p>
        <h2>Hasło i sesje</h2>
        <input
          aria-label="Obecne hasło"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          type="password"
          placeholder="Obecne hasło"
        />
        <input
          aria-label="Nowe hasło"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          type="password"
          placeholder="Nowe hasło, min. 12 znaków"
        />
        <div className="settings-actions">
          <button
            className="secondary"
            disabled={!current || next.length < 12}
            onClick={() => void change()}
            type="button"
          >
            Zmień hasło
          </button>
          <button className="text-action" onClick={() => void revoke()} type="button">
            Wyloguj pozostałe urządzenia
          </button>
          <button className="text-action danger-action" onClick={() => void onLogout()} type="button">
            Wyloguj się
          </button>
        </div>
        {notice && (
          <p className={notice.kind === 'error' ? 'form-error' : 'form-success'} role="status">
            {notice.text}
          </p>
        )}
      </div>
    </section>
  );
}
