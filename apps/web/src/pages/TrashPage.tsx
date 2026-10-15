import type { TrashEntry, TrashKind } from '@boberit/shared';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { formatTimestampDate } from '../format';
import { useReportError } from '../hooks/useReportError';

export function TrashPage({
  canEmpty,
  entries,
  onRestore,
  onEmpty,
}: {
  canEmpty: boolean;
  entries: TrashEntry[];
  onRestore: (kind: TrashKind, id: string) => Promise<void>;
  onEmpty: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<'all' | TrashKind>('all');
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const reportError = useReportError();
  const visible = entries.filter((entry) => filter === 'all' || entry.kind === filter);
  const daysLeft = (value: string) =>
    Math.max(0, 30 - Math.floor((Date.now() - new Date(value).valueOf()) / 86_400_000));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Usunięte elementy</p>
          <h1>Kosz</h1>
          <p>Przedmioty i dokumenty pozostają tutaj przez 30 dni, zanim zostaną usunięte trwale.</p>
        </div>
        {canEmpty && entries.length > 0 && (
          <button
            className="secondary danger-button"
            onClick={() => {
              if (window.confirm('Opróżnić cały Kosz? Tej operacji nie będzie można cofnąć.'))
                void onEmpty().catch(reportError('Nie udało się opróżnić Kosza.'));
            }}
            type="button"
          >
            Opróżnij kosz
          </button>
        )}
      </div>
      <div className="collection-heading">
        <div>
          <h2>
            Elementy w Koszu <em>{visible.length}</em>
          </h2>
        </div>
        <div className="filters">
          <button
            className={`filter ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
            type="button"
          >
            Wszystkie
          </button>
          <button
            className={`filter ${filter === 'asset' ? 'active' : ''}`}
            onClick={() => setFilter('asset')}
            type="button"
          >
            Przedmioty
          </button>
          <button
            className={`filter ${filter === 'document' ? 'active' : ''}`}
            onClick={() => setFilter('document')}
            type="button"
          >
            Dokumenty
          </button>
        </div>
      </div>
      <div className="trash-list">
        {visible.map((entry) => (
          <article className="trash-row" key={`${entry.kind}-${entry.id}`}>
            <span className="inbox-file-icon">
              <Icon name={entry.kind === 'asset' ? 'package' : 'file-text'} />
            </span>
            <div>
              <strong>{entry.name}</strong>
              <small>
                {entry.kind === 'asset' ? 'Przedmiot' : 'Dokument'}
                {entry.detail ? ` · ${entry.detail}` : ''}
              </small>
              <p>
                Usunięto {formatTimestampDate(entry.deletedAt)} · pozostało {daysLeft(entry.deletedAt)} dni
              </p>
            </div>
            <button
              className="secondary"
              disabled={restoringKey === `${entry.kind}-${entry.id}`}
              onClick={() => {
                setRestoringKey(`${entry.kind}-${entry.id}`);
                void onRestore(entry.kind, entry.id)
                  .catch(reportError('Nie udało się przywrócić elementu.'))
                  .finally(() => setRestoringKey(null));
              }}
              type="button"
            >
              {restoringKey === `${entry.kind}-${entry.id}` ? 'Przywracanie…' : 'Przywróć'}
            </button>
          </article>
        ))}
        {visible.length === 0 && (
          <div className="empty">
            <Icon name="trash" />
            <strong>Kosz jest pusty</strong>
            <p>Usunięte przedmioty i dokumenty będą tu dostępne przez 30 dni.</p>
          </div>
        )}
      </div>
    </>
  );
}
