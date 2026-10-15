import { useEffect, useRef, useState } from 'react';
import type { ReminderEntry, UiNotification } from '../types';
import { groupByDay } from '../format';
import { Icon } from './Icon';

const timeOfDay = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });

export function NotificationsMenu({
  hasUnreadToday,
  history,
  onClearHistory,
  onOpenAsset,
  onReadToday,
  todayReminders,
}: {
  hasUnreadToday: boolean;
  history: UiNotification[];
  onClearHistory: () => void;
  onOpenAsset: (id: string) => void;
  onReadToday: () => void;
  todayReminders: ReminderEntry[];
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.document.addEventListener('mousedown', closeOnOutside);
    window.document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.document.removeEventListener('mousedown', closeOnOutside);
      window.document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onReadToday();
  }
  return (
    <div className="notifications-menu-wrap" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={open ? 'notification-button active' : 'notification-button'}
        onClick={toggle}
        title="Powiadomienia"
        type="button"
      >
        <Icon label="Powiadomienia" name="bell" />
        {hasUnreadToday && <i aria-label="Nowe powiadomienia" />}
      </button>
      {open && (
        <section aria-label="Powiadomienia" className="notifications-panel" role="dialog">
          <header>
            <h2>Powiadomienia</h2>
            <button className="icon-button" onClick={() => setOpen(false)} type="button">
              <Icon label="Zamknij" name="x" />
            </button>
          </header>
          <div className="notifications-scroll">
            <section className="notifications-section">
              <h3>Na dziś</h3>
              {todayReminders.length ? (
                todayReminders.map((entry) => (
                  <button
                    className="notification-row notification-row--today"
                    key={entry.kind + '-' + entry.id}
                    onClick={() => {
                      onOpenAsset(entry.asset.id);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="notification-row-icon">
                      <Icon name={entry.kind === 'maintenance' ? 'tool' : 'shield-check'} />
                    </span>
                    <span>
                      <strong>{entry.kind === 'maintenance' ? entry.plan?.title : 'Koniec gwarancji'}</strong>
                      {/* One line keeps a single text node; a formatter break would emit {' '} instead. */}
                      {/* prettier-ignore */}
                      <small>{entry.asset.name} · {entry.kind === 'maintenance' ? 'Przegląd jest zaplanowany na dziś' : 'Gwarancja wygasa dzisiaj'}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="notifications-empty">Brak terminów przypadających na dziś.</p>
              )}
            </section>
            <section className="notifications-section">
              <div className="notifications-section-title">
                <h3>Ostatnie działania</h3>
                {history.length > 0 && (
                  <button className="text-action" onClick={onClearHistory} type="button">
                    Wyczyść
                  </button>
                )}
              </div>
              {history.length ? (
                groupByDay(history.slice(0, 20), (entry) => new Date(entry.createdAt)).map((group) => (
                  <div className="notifications-day" key={group.label}>
                    <p>{group.label}</p>
                    {group.items.map((entry) => (
                      <div
                        className={`notification-row notification-row--history${entry.tone === 'error' ? ' is-error' : ''}`}
                        key={entry.id}
                      >
                        <span className="notification-row-icon">
                          <Icon
                            label={entry.tone === 'error' ? 'Błąd' : 'Wykonano'}
                            name={entry.tone === 'error' ? 'alert-triangle' : 'circle-check'}
                          />
                        </span>
                        <span>
                          <strong>{entry.message}</strong>
                        </span>
                        <small>{timeOfDay.format(new Date(entry.createdAt))}</small>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p className="notifications-empty">Działania wykonane w aplikacji pojawią się tutaj.</p>
              )}
            </section>
          </div>
        </section>
      )}
    </div>
  );
}
