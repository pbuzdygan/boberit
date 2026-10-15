import { useEffect, useRef, useState } from 'react';
import type { AccountSection } from '../types';
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
  onSelect: (section: AccountSection) => void;
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
  function choose(section: AccountSection) {
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
          <p className="account-menu-label">Twoje gospodarstwa domowe</p>
          <button onClick={() => choose('households')} role="menuitem" type="button">
            <span className="account-menu-icon">
              <Icon name="home" />
            </span>
            <span>
              <strong>Gospodarstwa</strong>
              <small>Tworzenie i zmiana nazw</small>
            </span>
          </button>
          <button onClick={() => choose('members')} role="menuitem" type="button">
            <span className="account-menu-icon">
              <Icon name="package" />
            </span>
            <span>
              <strong>Członkowie</strong>
              <small>Dostęp i role użytkowników</small>
            </span>
          </button>
          <p className="account-menu-label">Konto</p>
          <button onClick={() => choose('security')} role="menuitem" type="button">
            <span className="account-menu-icon">
              <Icon name="shield-check" />
            </span>
            <span>
              <strong>Bezpieczeństwo konta</strong>
              <small>Hasło i aktywne sesje</small>
            </span>
          </button>
          <button onClick={() => choose('webhooks')} role="menuitem" type="button">
            <span className="account-menu-icon">
              <Icon name="dots" />
            </span>
            <span>
              <strong>Webhooki</strong>
              <small>Integracje i powiadomienia</small>
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
