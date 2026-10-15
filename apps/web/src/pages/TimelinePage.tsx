import { type AssetSummary, type MaintenancePlan, daysUntil } from '@boberit/shared';
import { useMemo } from 'react';
import { timelineEntries } from '../collections';
import { Icon } from '../components/Icon';
import { formatDate } from '../format';
import { intervalLabel } from '../labels';
import type { TimelineFilter, ReminderEntry } from '../types';

export function TimelinePage({
  assets,
  filter,
  onFilter,
  onOpen,
  onComplete,
}: {
  assets: AssetSummary[];
  filter: TimelineFilter;
  onFilter: (filter: TimelineFilter) => void;
  onOpen: (id: string) => Promise<void>;
  onComplete: (plan: MaintenancePlan) => void;
}) {
  const entries = useMemo(() => timelineEntries(assets), [assets]);
  const visible = entries.filter((entry) => filter === 'all' || entry.kind === filter);
  const counts = {
    all: entries.length,
    maintenance: entries.filter((entry) => entry.kind === 'maintenance').length,
    warranty: entries.filter((entry) => entry.kind === 'warranty').length,
  };
  const overdue = visible.filter((entry) => daysUntil(entry.dueOn) < 0).length;
  const soon = visible.filter((entry) => {
    const days = daysUntil(entry.dueOn);
    return days >= 0 && days <= 30;
  }).length;
  const later = visible.length - overdue - soon;
  const groups: { key: 'overdue' | 'soon' | 'later'; label: string; entries: ReminderEntry[] }[] = [
    { key: 'overdue', label: 'Zaległe', entries: visible.filter((entry) => daysUntil(entry.dueOn) < 0) },
    {
      key: 'soon',
      label: 'Najbliższe 30 dni',
      entries: visible.filter((entry) => {
        const days = daysUntil(entry.dueOn);
        return days >= 0 && days <= 30;
      }),
    },
    { key: 'later', label: 'Później', entries: visible.filter((entry) => daysUntil(entry.dueOn) > 30) },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Planowanie domu</p>
          <h1>Terminy</h1>
          <p>Gwarancje i konserwacje w jednym, uporządkowanym miejscu.</p>
        </div>
      </div>
      <div className="timeline-stats">
        <div className={overdue ? 'timeline-stat alert' : 'timeline-stat'}>
          <strong>{overdue}</strong>
          <span>zaległe</span>
        </div>
        <div className="timeline-stat">
          <strong>{soon}</strong>
          <span>w ciągu 30 dni</span>
        </div>
        <div className="timeline-stat">
          <strong>{later}</strong>
          <span>później</span>
        </div>
      </div>
      <div className="collection-heading timeline-toolbar">
        <div>
          <h2>
            Lista terminów <em>{visible.length}</em>
          </h2>
          <p>Oznaczenie konserwacji jako wykonanej od razu wyliczy jej kolejny termin.</p>
        </div>
        <div className="filters">
          <button
            className={`filter ${filter === 'all' ? 'active' : ''}`}
            type="button"
            onClick={() => onFilter('all')}
          >
            Wszystkie <em>{counts.all}</em>
          </button>
          <button
            className={`filter ${filter === 'maintenance' ? 'active' : ''}`}
            type="button"
            onClick={() => onFilter('maintenance')}
          >
            Konserwacja <em>{counts.maintenance}</em>
          </button>
          <button
            className={`filter ${filter === 'warranty' ? 'active' : ''}`}
            type="button"
            onClick={() => onFilter('warranty')}
          >
            Gwarancje <em>{counts.warranty}</em>
          </button>
        </div>
      </div>
      {visible.length > 0 ? (
        <div className="timeline-groups">
          {groups
            .filter((group) => group.entries.length > 0)
            .map((group) => (
              <section
                className={`timeline-group ${group.key}`}
                key={group.key}
                aria-labelledby={`timeline-group-${group.key}`}
              >
                <div className="timeline-group-heading">
                  <span aria-hidden="true" />
                  <strong id={`timeline-group-${group.key}`}>{group.label}</strong>
                  <small>{group.entries.length}</small>
                </div>
                <div className="timeline-list">
                  {group.entries.map((entry) => {
                    const days = daysUntil(entry.dueOn);
                    const label =
                      days < 0
                        ? `${Math.abs(days)} dni po terminie`
                        : days === 0
                          ? 'Dzisiaj'
                          : days === 1
                            ? 'Jutro'
                            : `Za ${days} dni`;
                    return (
                      <article
                        className={`timeline-row ${days < 0 ? 'overdue' : days <= 30 ? 'soon' : ''}`}
                        key={entry.id}
                      >
                        <div className="date-tile">
                          <strong>{new Date(`${entry.dueOn}T12:00:00`).getDate()}</strong>
                          <span>
                            {new Intl.DateTimeFormat('pl-PL', { month: 'short' }).format(
                              new Date(`${entry.dueOn}T12:00:00`),
                            )}
                          </span>
                        </div>
                        <span className="timeline-icon">
                          <Icon name={entry.kind === 'maintenance' ? 'tool' : 'shield-check'} />
                        </span>
                        <div className="timeline-copy">
                          <small>
                            {entry.kind === 'maintenance'
                              ? `Konserwacja · ${entry.plan ? intervalLabel(entry.plan) : ''}`
                              : 'Gwarancja producenta'}
                          </small>
                          <strong>
                            {entry.kind === 'maintenance' ? entry.plan?.title : 'Koniec gwarancji'} · {entry.asset.name}
                          </strong>
                          <p>
                            {label} · {formatDate(entry.dueOn)}
                          </p>
                        </div>
                        {entry.kind === 'maintenance' && entry.plan ? (
                          <button className="secondary" type="button" onClick={() => onComplete(entry.plan!)}>
                            Wykonane
                          </button>
                        ) : (
                          <button className="text-action" type="button" onClick={() => void onOpen(entry.asset.id)}>
                            Sprawdź
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div className="timeline-empty">
          <div className="empty">
            <Icon name="calendar-event" />
            <strong>Brak terminów w tym widoku</strong>
            <p>Dodaj gwarancję lub plan konserwacji do wybranego przedmiotu.</p>
          </div>
        </div>
      )}
    </>
  );
}
