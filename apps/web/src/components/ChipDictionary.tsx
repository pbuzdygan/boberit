import { type FormEvent, useState } from 'react';
import { Icon } from './Icon';
import { SettingsBlock } from './SettingsBlock';

type Entry = { id: string; name: string };

/**
 * A short dictionary (categories, locations, document types) shown as chips. Owners add entries
 * in place (the field stays open for the next one), rename them with the pencil, and remove them.
 */
export function ChipDictionary({
  title,
  description,
  entries,
  canManage,
  addLabel,
  placeholder,
  emptyText,
  onAdd,
  onRename,
  onRemove,
}: {
  title: string;
  description: string;
  entries: Entry[];
  canManage: boolean;
  addLabel: string;
  placeholder: string;
  emptyText: string;
  onAdd: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onRemove: (entry: Entry) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action: () => Promise<void>, fallback: string): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallback);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    const name = draft.trim();
    if (!name || busy) return;
    if (await run(() => onAdd(name), 'Nie udało się dodać pozycji.')) setDraft('');
  }
  async function rename(event: FormEvent, entry: Entry) {
    event.preventDefault();
    const name = editingName.trim();
    if (!name || busy) return;
    if (name === entry.name || (await run(() => onRename(entry.id, name), 'Nie udało się zmienić nazwy.')))
      setEditingId(null);
  }

  return (
    <SettingsBlock title={title} description={description}>
      <ul aria-label={title} className="chip-list">
        {entries.map((entry) => (
          <li className={`chip${editingId === entry.id ? ' chip--editing' : ''}`} key={entry.id}>
            {editingId === entry.id ? (
              <form onSubmit={(event) => void rename(event, entry)}>
                <input
                  aria-label={`Nowa nazwa: ${entry.name}`}
                  autoFocus
                  maxLength={80}
                  onChange={(event) => setEditingName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setEditingId(null);
                  }}
                  value={editingName}
                />
                <button aria-label="Zapisz nazwę" className="chip-icon" disabled={busy} type="submit">
                  <Icon name="check" />
                </button>
                <button aria-label="Anuluj" className="chip-icon" onClick={() => setEditingId(null)} type="button">
                  <Icon name="x" />
                </button>
              </form>
            ) : (
              <>
                <span>{entry.name}</span>
                {canManage && (
                  <>
                    <button
                      aria-label={`Zmień nazwę: ${entry.name}`}
                      className="chip-icon"
                      onClick={() => {
                        setEditingId(entry.id);
                        setEditingName(entry.name);
                        setError('');
                      }}
                      title="Zmień nazwę"
                      type="button"
                    >
                      <Icon name="pencil" />
                    </button>
                    <button
                      aria-label={`Usuń: ${entry.name}`}
                      className="chip-icon chip-icon--danger"
                      disabled={busy}
                      onClick={() => void run(() => onRemove(entry), 'Nie udało się usunąć pozycji.')}
                      title="Usuń"
                      type="button"
                    >
                      <Icon name="x" />
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
        {canManage &&
          (adding ? (
            <li className="chip chip--editing">
              <form onSubmit={(event) => void add(event)}>
                <input
                  aria-label={addLabel}
                  autoFocus
                  maxLength={80}
                  onBlur={() => {
                    if (!draft.trim()) setAdding(false);
                  }}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setDraft('');
                      setAdding(false);
                    }
                  }}
                  placeholder={placeholder}
                  value={draft}
                />
                <button aria-label="Dodaj" className="chip-icon" disabled={busy || !draft.trim()} type="submit">
                  <Icon name="check" />
                </button>
              </form>
            </li>
          ) : (
            <li>
              <button className="chip chip--add" onClick={() => setAdding(true)} type="button">
                <Icon name="plus" />
                {addLabel}
              </button>
            </li>
          ))}
      </ul>
      {!entries.length && !canManage && <p className="subtle">{emptyText}</p>}
      {error && <p className="form-error">{error}</p>}
    </SettingsBlock>
  );
}
