import { type IconName, Icon } from '../components/Icon';
import type { HouseholdMembership, SettingsSection } from '../types';
import { ActivitySettings } from './ActivitySettings';
import { AboutSettings } from './AboutSettings';
import { BackupSettings } from './BackupSettings';
import { DataSettings } from './DataSettings';
import { GeneralSettings } from './GeneralSettings';
import { HouseholdSettings } from './HouseholdSettings';
import { MembersSettings } from './MembersSettings';
import { SecuritySettings } from './SecuritySettings';
import { WebhookSettings } from './WebhookSettings';

type MenuItem = { section: SettingsSection; label: string; hint: string; icon: IconName };

const householdItems: MenuItem[] = [
  { section: 'general', label: 'Ogólne', hint: 'Nazwa i zawartość gospodarstwa', icon: 'settings' },
  { section: 'members', label: 'Członkowie', hint: 'Kto ma dostęp i z jaką rolą', icon: 'users' },
  { section: 'data', label: 'Kategorie i typy', hint: 'Kategorie, lokalizacje, typy dokumentów', icon: 'tag' },
  { section: 'backup', label: 'Kopia zapasowa', hint: 'Pobieranie i przywracanie danych', icon: 'archive' },
  { section: 'activity', label: 'Historia', hint: 'Kto i kiedy zmieniał dane', icon: 'history' },
];
const accountItems: MenuItem[] = [
  { section: 'households', label: 'Gospodarstwa', hint: 'Przełączanie i nowe gospodarstwa', icon: 'home' },
  { section: 'security', label: 'Bezpieczeństwo', hint: 'Hasło i zalogowane urządzenia', icon: 'shield-check' },
  { section: 'integrations', label: 'Integracje', hint: 'Webhooki do innych usług', icon: 'webhook' },
];

/**
 * Settings of the active household and of the signed-in account in one place. With no section
 * chosen, phones show the section list and desktops show "Ogólne" next to the menu.
 */
export function SettingsPage({
  section,
  onSection,
  account,
  households,
  activeHouseholdId,
  onSwitchHousehold,
  itemCount,
  documentCount,
  storageBytes,
}: {
  section: SettingsSection | null;
  onSection: (section: SettingsSection | null) => void;
  account: { login: string; email: string } | null;
  households: HouseholdMembership[];
  activeHouseholdId: string | null;
  onSwitchHousehold: (id: string) => Promise<void>;
  itemCount: number;
  documentCount: number;
  storageBytes: number;
}) {
  const household = households.find((entry) => entry.id === activeHouseholdId);
  const isOwner = household?.role === 'owner';
  const current = section ?? 'general';

  function menuGroup(title: string, subtitle: string | undefined, items: MenuItem[]) {
    return (
      <div className="settings-menu-group">
        <p>
          {title}
          {subtitle && <small>{subtitle}</small>}
        </p>
        <ul>
          {items.map((item) => (
            <li key={item.section}>
              <button
                aria-current={current === item.section ? 'page' : undefined}
                className={current === item.section ? 'active' : ''}
                onClick={() => onSection(item.section)}
                type="button"
              >
                <span aria-hidden="true" className="settings-menu-icon">
                  <Icon name={item.icon} />
                </span>
                <span className="settings-menu-text">
                  {item.label}
                  <small>{item.hint}</small>
                </span>
                <span aria-hidden="true" className="settings-menu-chevron">
                  <Icon name="chevron-right" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={`settings-shell${section ? ' is-reading' : ''}`}>
      <div className="page-heading settings-page-heading">
        <div>
          <h1>Ustawienia</h1>
          <p>Gospodarstwo, z którym pracujesz, oraz Twoje konto.</p>
        </div>
      </div>
      <nav aria-label="Sekcje ustawień" className="settings-menu">
        {menuGroup('Gospodarstwo', household?.name, householdItems)}
        {menuGroup('Twoje konto', account?.login, accountItems)}
        {menuGroup('Aplikacja', undefined, [
          { section: 'about', label: 'Informacje', hint: 'Wersja i aktualizacje', icon: 'info-circle' },
        ])}
      </nav>
      <div className="settings-main">
        <button className="back settings-back" onClick={() => onSection(null)} type="button">
          <Icon name="arrow-left" /> Ustawienia
        </button>
        {current === 'general' ? (
          <GeneralSettings
            documentCount={documentCount}
            household={household}
            itemCount={itemCount}
            storageBytes={storageBytes}
          />
        ) : current === 'members' ? (
          <MembersSettings currentLogin={account?.login ?? null} />
        ) : current === 'data' ? (
          <DataSettings canManage={isOwner} />
        ) : current === 'backup' ? (
          <BackupSettings isOwner={isOwner} />
        ) : current === 'activity' ? (
          <ActivitySettings />
        ) : current === 'households' ? (
          <HouseholdSettings
            activeHouseholdId={activeHouseholdId}
            households={households}
            onSwitch={onSwitchHousehold}
          />
        ) : current === 'security' ? (
          <SecuritySettings account={account} />
        ) : current === 'about' ? (
          <AboutSettings />
        ) : (
          <WebhookSettings />
        )}
      </div>
    </div>
  );
}
