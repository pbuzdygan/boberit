import { useId } from 'react';
import { useDialog } from '../hooks/useDialog';
import { Icon } from './Icon';

export function MobileMoreMenu({
  inboxCount,
  onClose,
  onNavigate,
  trashCount,
}: {
  inboxCount: number;
  onClose: () => void;
  onNavigate: (view: 'timeline' | 'inbox' | 'trash' | 'settings') => void;
  trashCount: number;
}) {
  const dialog = useDialog<HTMLElement>(onClose);
  const titleId = useId();
  return (
    <div className="dialog-backdrop mobile-more-backdrop" role="presentation">
      <section {...dialog} aria-labelledby={titleId} aria-modal="true" className="mobile-more-dialog" role="dialog">
        <header>
          <div>
            <p className="eyebrow">Nawigacja</p>
            <h2 id={titleId}>Więcej</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <Icon label="Zamknij" name="x" />
          </button>
        </header>
        <div className="mobile-more-links">
          <button onClick={() => onNavigate('timeline')} type="button">
            <span className="mobile-more-icon">
              <Icon name="calendar-event" />
            </span>
            <span>
              <strong>Terminy</strong>
              <small>Gwarancje i zaplanowane czynności</small>
            </span>
          </button>
          <button onClick={() => onNavigate('inbox')} type="button">
            <span className="mobile-more-icon">
              <Icon name="file-text" />
            </span>
            <span>
              <strong>Do przypisania ({inboxCount})</strong>
              <small>Pliki oczekujące na przypisanie</small>
            </span>
          </button>
          <button onClick={() => onNavigate('trash')} type="button">
            <span className="mobile-more-icon">
              <Icon name="trash" />
            </span>
            <span>
              <strong>Kosz ({trashCount})</strong>
              <small>Elementy oczekujące na usunięcie</small>
            </span>
          </button>
          <button onClick={() => onNavigate('settings')} type="button">
            <span className="mobile-more-icon">
              <Icon name="dots" />
            </span>
            <span>
              <strong>Ustawienia</strong>
              <small>Backup, dane i historia</small>
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
