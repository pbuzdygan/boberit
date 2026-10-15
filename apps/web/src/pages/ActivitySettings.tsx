import { useEffect, useState } from 'react';
import { api } from '../api';
import { type IconName, Icon } from '../components/Icon';
import { SettingsHeader } from '../components/SettingsBlock';
import { groupByDay } from '../format';
import { eventLabel } from '../labels';

type AuditEvent = {
  action: string;
  entity_kind: string;
  label: string | null;
  user_login: string | null;
  created_at: string;
};
type ActivityFilter = 'all' | 'asset' | 'document' | 'household';

const pageSize = 30;
const timeOfDay = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });
const actionLabels: Record<string, string> = {
  created: 'Utworzono',
  trashed: 'Przeniesiono do Kosza',
  restored: 'Przywrócono',
  deleted: 'Usunięto',
  exported: 'Pobrano',
  emptied: 'Opróżniono',
  'password.changed': 'Zmieniono hasło użytkownika',
  'sessions.revoked': 'Wylogowano inne sesje',
  'login.locked': 'Zablokowano logowanie po nieudanych próbach',
  'member.added': 'Dodano członka gospodarstwa',
  'member.promoted': 'Nadano rolę właściciela',
  'member.demoted': 'Zmieniono rolę na członka',
  'member.removed': 'Usunięto członka gospodarstwa',
  'webhook.created': 'Dodano webhook',
  'webhook.updated': 'Zmieniono webhook',
  'webhook.deleted': 'Usunięto webhook',
};
const entityLabels: Record<string, string> = {
  asset: 'przedmiot',
  document: 'dokument',
  account: 'konto',
  session: 'sesję',
  backup: 'kopię zapasową',
  trash: 'Kosz',
};
const filters: { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'Wszystko' },
  { value: 'asset', label: 'Przedmioty' },
  { value: 'document', label: 'Dokumenty' },
  { value: 'household', label: 'Gospodarstwo i konta' },
];

// Compound actions ("member.added") are complete phrases; simple ones are combined with the entity.
function describe(event: AuditEvent): string {
  return event.action.includes('.')
    ? (actionLabels[event.action] ?? event.action)
    : `${actionLabels[event.action] ?? eventLabel(`${event.entity_kind}.${event.action}`)} ${entityLabels[event.entity_kind] ?? event.entity_kind}`;
}
function iconFor(event: AuditEvent): IconName {
  if (event.action.startsWith('member.')) return 'users';
  if (event.action.startsWith('webhook.')) return 'webhook';
  if (event.entity_kind === 'asset') return 'package';
  if (event.entity_kind === 'document') return 'file-text';
  if (event.entity_kind === 'backup') return 'archive';
  if (event.entity_kind === 'trash') return 'trash';
  return 'shield-check';
}
function matches(event: AuditEvent, filter: ActivityFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'household') return event.entity_kind !== 'asset' && event.entity_kind !== 'document';
  return event.entity_kind === filter;
}

/** What happened in the active household, newest first and grouped by day. */
export function ActivitySettings() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void api
      .activity()
      .then((r) => setEvents(r.data))
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'Nie udało się wczytać historii gospodarstwa.'),
      )
      .finally(() => setLoaded(true));
  }, []);
  const visible = events.filter((event) => matches(event, filter));
  const groups = groupByDay(visible.slice(0, visibleCount), (event) => new Date(event.created_at));

  return (
    <>
      <SettingsHeader
        description="Kto i kiedy zmieniał dane tego gospodarstwa. Widoczne jest 100 ostatnich działań."
        title="Historia"
      />
      <div className="filters activity-filters">
        {filters.map((option) => (
          <button
            aria-pressed={filter === option.value}
            className={`filter${filter === option.value ? ' active' : ''}`}
            key={option.value}
            onClick={() => {
              setFilter(option.value);
              setVisibleCount(pageSize);
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      {groups.map((group) => (
        <section className="activity-day" key={group.label}>
          <h3>{group.label}</h3>
          <ul>
            {group.items.map((event, index) => (
              <li key={`${event.created_at}-${index}`}>
                <span aria-hidden="true" className="activity-icon">
                  <Icon name={iconFor(event)} />
                </span>
                <span className="activity-text">
                  <strong>{describe(event)}</strong>
                  {event.label && <span>{event.label}</span>}
                </span>
                <small>
                  {event.user_login ?? 'system'} · {timeOfDay.format(new Date(event.created_at))}
                </small>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {loaded && !visible.length && !error && (
        <div className="empty settings-empty">
          <Icon name="history" />
          <strong>Brak działań w tym widoku</strong>
          <p>Zmiany przedmiotów, dokumentów i ustawień pojawią się tutaj.</p>
        </div>
      )}
      {visible.length > visibleCount && (
        <button
          className="secondary activity-more"
          onClick={() => setVisibleCount((count) => count + pageSize)}
          type="button"
        >
          Pokaż więcej
        </button>
      )}
    </>
  );
}
