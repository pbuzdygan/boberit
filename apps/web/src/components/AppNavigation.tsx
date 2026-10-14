import type { View } from '../types';
import { Icon } from './Icon';

/**
 * Desktop sidebar. Items count as active only while no item detail is open. Counts are hidden
 * until the data has loaded, so a pending or failed load does not read as zero.
 */
export function Sidebar({
  view,
  hasSelection,
  itemCount,
  documentCount,
  inboxCount,
  trashCount,
  showCounts,
  onNavigate,
}: {
  view: View;
  hasSelection: boolean;
  showCounts: boolean;
  itemCount: number;
  documentCount: number;
  inboxCount: number;
  trashCount: number;
  onNavigate: (view: View) => void;
}) {
  return (
    <aside className="sidebar">
      <button
        className="brand"
        type="button"
        onClick={() => {
          onNavigate('start');
        }}
      >
        <img src="/branding/boberit-icon.png" alt="" />
        <strong>Boberit</strong>
      </button>
      <nav aria-label="Nawigacja główna">
        <button
          className={`nav-item ${view === 'start' && !hasSelection ? 'active' : ''}`}
          type="button"
          onClick={() => {
            onNavigate('start');
          }}
        >
          <Icon name="home" /> Start
        </button>
        <button
          className={`nav-item ${view === 'items' || hasSelection ? 'active' : ''}`}
          type="button"
          onClick={() => {
            onNavigate('items');
          }}
        >
          <Icon name="package" /> Przedmioty {showCounts && <span>{itemCount}</span>}
        </button>
        <button
          className={`nav-item ${['binder', 'document-ocr'].includes(view) && !hasSelection ? 'active' : ''}`}
          type="button"
          onClick={() => {
            onNavigate('binder');
          }}
        >
          <Icon name="file-text" /> Dokumenty {showCounts && <span>{documentCount}</span>}
        </button>
        <button
          className={`nav-item ${view === 'timeline' && !hasSelection ? 'active' : ''}`}
          type="button"
          onClick={() => {
            onNavigate('timeline');
          }}
        >
          <Icon name="calendar-event" /> Terminy
        </button>
        <button
          className={`nav-item ${view === 'inbox' && !hasSelection ? 'active' : ''}`}
          type="button"
          onClick={() => {
            onNavigate('inbox');
          }}
        >
          <Icon name="file-text" /> Do przypisania {showCounts && <span>{inboxCount}</span>}
        </button>
      </nav>
      <div className="sidebar-footer">
        <button
          className={`nav-item ${view === 'trash' && !hasSelection ? 'active' : ''}`}
          type="button"
          onClick={() => {
            onNavigate('trash');
          }}
        >
          <Icon name="trash" /> Kosz {showCounts && <span>{trashCount}</span>}
        </button>
        <button
          className={`nav-item sidebar-settings ${view === 'settings' && !hasSelection ? 'active' : ''}`}
          type="button"
          onClick={() => {
            onNavigate('settings');
          }}
        >
          <Icon name="dots" /> Ustawienia
        </button>
      </div>
    </aside>
  );
}

/** Bottom navigation on narrow screens; less frequent views sit behind "Więcej". */
export function MobileNav({
  view,
  hasSelection,
  onNavigate,
  onQuickAdd,
  onMore,
}: {
  view: View;
  hasSelection: boolean;
  onNavigate: (view: View) => void;
  onQuickAdd: () => void;
  onMore: () => void;
}) {
  return (
    <nav className="mobile-nav" aria-label="Nawigacja mobilna">
      <button
        className={view === 'start' && !hasSelection ? 'active' : ''}
        onClick={() => {
          onNavigate('start');
        }}
        type="button"
      >
        <Icon name="home" />
        <span>Start</span>
      </button>
      <button
        className={view === 'items' || hasSelection ? 'active' : ''}
        onClick={() => {
          onNavigate('items');
        }}
        type="button"
      >
        <Icon name="package" />
        <span>Przedmioty</span>
      </button>
      <button className="mobile-add" aria-label="Dodaj przedmiot lub dokument" onClick={onQuickAdd} type="button">
        <span>
          <Icon name="plus" />
        </span>
        <b>Dodaj</b>
      </button>
      <button
        className={['binder', 'document-ocr'].includes(view) && !hasSelection ? 'active' : ''}
        onClick={() => {
          onNavigate('binder');
        }}
        type="button"
      >
        <Icon name="file-text" />
        <span>Dokumenty</span>
      </button>
      <button
        className={['timeline', 'inbox', 'trash', 'settings'].includes(view) && !hasSelection ? 'active' : ''}
        onClick={onMore}
        type="button"
      >
        <Icon name="dots" />
        <span>Więcej</span>
      </button>
    </nav>
  );
}
