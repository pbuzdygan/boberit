import { useEffect, useRef, useState } from 'react';
import type { SettingsSection } from '../types';
import { FormSelect } from './FormSelect';
import { Icon } from './Icon';

export function AccountMenu({
  account,
  active,
  activeHouseholdId,
  avatarInitials,
  households,
  onLogout,
  onSelect,
  onSwitch,
}: {
  account: { login: string; email: string } | null;
  active: boolean;
  activeHouseholdId: string | null;
  avatarInitials: string;
  households: { id: string; name: string; role: string }[];
  onLogout: () => Promise<void>;
  onSelect: (section: SettingsSection) => void;
  onSwitch: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.document.addEventListener('mousedown', closeOnOutsideClick);
    window.document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.document.removeEventListener('mousedown', closeOnOutsideClick);
      window.document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  function choose(section: SettingsSection) {
    onSelect(section);
    setOpen(false);
  }
  return (
    <div className="account-menu-wrap" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`topbar-avatar ${active ? 'active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title="Konto użytkownika"
        type="button"
      >
        {avatarInitials}
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <header>
            <span className="account-menu-avatar">{avatarInitials}</span>
            <div>
              <strong>{account?.login ?? 'Użytkownik'}</strong>
              <small>{account?.email ?? ''}</small>
            </div>
          </header>
          {households.length > 0 && (
            <FormSelect
              className="account-household-switch"
              label="Aktywne gospodarstwo"
              value={activeHouseholdId ?? ''}
              onChange={(id) => {
                void onSwitch(id).then(() => setOpen(false));
              }}
              options={households.map((household) => ({ value: household.id, label: household.name }))}
            />
          )}
          <p className="account-menu-label">Twoje konto</p>
          <button onClick={() => choose('households')} role="menuitem" type="button">
            <span className="account-menu-icon">
              <Icon name="home" />
            </span>
            <span>
              <strong>Twoje gospodarstwa</strong>
              <small>Przełączanie i nowe gospodarstwa</small>
            </span>
          </button>
          <button onClick={() => choose('security')} role="menuitem" type="button">
            <span className="account-menu-icon">
              <Icon name="shield-check" />
            </span>
            <span>
              <strong>Bezpieczeństwo</strong>
              <small>Hasło i zalogowane urządzenia</small>
            </span>
          </button>
          <button onClick={() => choose('integrations')} role="menuitem" type="button">
            <span className="account-menu-icon">
              <Icon name="webhook" />
            </span>
            <span>
              <strong>Integracje</strong>
              <small>Webhooki do innych usług</small>
            </span>
          </button>
          <button
            className="account-logout"
            onClick={() => void onLogout().then(() => setOpen(false))}
            role="menuitem"
            type="button"
          >
            Wyloguj się
          </button>
        </div>
      )}
    </div>
  );
}
