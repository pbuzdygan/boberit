import type { BinderDocument, CreateBinderDocumentInput, DocumentType } from '@boberit/shared';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { FormSelect } from './FormSelect';
import { Icon } from './Icon';

export function DocumentEditDialog({
  document,
  onClose,
  onSave,
}: {
  document: BinderDocument;
  onClose: () => void;
  onSave: (id: string, input: Partial<CreateBinderDocumentInput>) => Promise<void>;
}) {
  const [name, setName] = useState(document.name);
  const [typeId, setTypeId] = useState(document.typeId ?? '');
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [tags, setTags] = useState(document.tags.join(', '));
  const [notes, setNotes] = useState(document.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const formTags = tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const hasChanges =
    name.trim() !== document.name ||
    typeId !== (document.typeId ?? '') ||
    JSON.stringify(formTags) !== JSON.stringify(document.tags) ||
    notes.trim() !== (document.notes ?? '');
  useEffect(() => {
    void api.listDocumentTypes().then((r) => setTypes(r.data));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!hasChanges) return;
    setBusy(true);
    setError('');
    try {
      await onSave(document.id, { name, typeId: typeId || null, tags: formTags, notes });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać zmian dokumentu.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="dialog document-edit-dialog" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Dokument</p>
            <h2>Edytuj dane</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <Icon label="Zamknij" name="x" />
          </button>
        </header>
        <div className="document-edit-grid">
          <label>
            Nazwa
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <FormSelect
            label="Typ"
            value={typeId}
            onChange={setTypeId}
            options={[
              { value: '', label: 'Brak typu' },
              ...types.map((type) => ({ value: type.id, label: type.name })),
            ]}
          />
          <label className="span-all">
            Tagi
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Oddziel przecinkami" />
          </label>
          <label className="span-all">
            Notatka
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button className="secondary" onClick={onClose} type="button">
            Anuluj
          </button>
          <button
            className={`primary save-changes-button${hasChanges ? ' is-pending' : ''}`}
            disabled={busy || !name.trim() || !hasChanges}
            type="submit"
          >
            {busy ? 'Zapisywanie…' : 'Zapisz zmiany'}
          </button>
        </footer>
      </form>
    </div>
  );
}
