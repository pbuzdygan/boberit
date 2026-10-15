import { useEffect, useRef, useState } from 'react';
import type { ReminderEntry, UiNotification } from '../types';
import { Icon } from './Icon';

export function NotificationsMenu({
  hasUnreadToday,
  history,
  onOpenAsset,
  onReadToday,
  todayReminders,
}: {
  hasUnreadToday: boolean;
  history: UiNotification[];
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
            <div>
              <p className="eyebrow">Powiadomienia</p>
              <h2>Centrum powiadomień</h2>
            </div>
            <button className="icon-button" onClick={() => setOpen(false)} type="button">
              <Icon label="Zamknij" name="x" />
            </button>
          </header>
          <div className="notifications-scroll">
            <section className="notifications-section">
              <h3>Dzisiaj</h3>
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
              <h3>Historia działań</h3>
              {history.length ? (
                history.slice(0, 20).map((entry) => (
                  <div className="notification-row notification-row--history" key={entry.id}>
                    <span className="notification-row-icon">
                      <Icon name="bell" />
                    </span>
                    <span>
                      <strong>{entry.message}</strong>
                      <small>
                        {new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' }).format(
                          new Date(entry.createdAt),
                        )}
                      </small>
                    </span>
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
