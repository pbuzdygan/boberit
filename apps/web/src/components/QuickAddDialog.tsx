import type { CreateBinderDocumentInput, CreateAssetInput } from '@boberit/shared';
import { FormEvent, useId, useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { useDocumentTypes } from '../hooks/useDocumentTypes';
import { FormSelect } from './FormSelect';
import { Icon } from './Icon';

export type QuickAddKind = 'asset' | 'document';

export function QuickAddDialog({
  initialKind,
  onClose,
  onSave,
}: {
  initialKind: QuickAddKind;
  onClose: () => void;
  onSave: (
    kind: 'asset' | 'document',
    input: CreateAssetInput | CreateBinderDocumentInput,
    files: File[],
  ) => Promise<void>;
}) {
  const [kind, setKind] = useState<QuickAddKind>(initialKind);
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [typeId, setTypeId] = useState('');
  const documentTypes = useDocumentTypes();
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useDialog<HTMLFormElement>(onClose);
  const titleId = useId();
  function selectFiles(list: FileList | null) {
    const selectedFiles = Array.from(list ?? []);
    if (selectedFiles.length) setFiles((current) => [...current, ...selectedFiles]);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const parsedTags = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      await onSave(
        kind,
        kind === 'asset'
          ? { name: name.trim(), manufacturer, modelNumber, tags: parsedTags }
          : { name: name.trim(), typeId: typeId || null, tags: parsedTags, notes },
        files,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dialog-backdrop quick-add-backdrop" role="presentation">
      <form
        {...dialog}
        aria-labelledby={titleId}
        aria-modal="true"
        role="dialog"
        className="dialog quick-add-dialog"
        onSubmit={submit}
      >
        <header>
          <div>
            <p className="eyebrow">Szybki zapis</p>
            <h2 id={titleId}>Co chcesz dodać?</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <Icon name="x" label="Zamknij" />
          </button>
        </header>
        <div className="quick-kind-tabs">
          <button className={kind === 'asset' ? 'active' : ''} onClick={() => setKind('asset')} type="button">
            <Icon name="package" />
            Przedmiot
          </button>
          <button className={kind === 'document' ? 'active' : ''} onClick={() => setKind('document')} type="button">
            <Icon name="file-text" />
            Dokument
          </button>
        </div>
        <label>
          Nazwa {kind === 'asset' ? 'przedmiotu' : 'dokumentu'}
          <input
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={kind === 'asset' ? 'np. Ekspres do kawy' : 'np. Faktura za usługę'}
          />
        </label>
        <div className="quick-file-actions">
          <label className="secondary inbox-upload quick-photo">
            Zrób zdjęcie
            <input
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                selectFiles(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
              type="file"
            />
          </label>
          <label className="secondary inbox-upload">
            Wybierz plik
            <input
              multiple
              accept="image/*,.pdf,.txt,.doc,.docx"
              onChange={(event) => {
                selectFiles(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
              type="file"
            />
          </label>
        </div>
        {files.length > 0 && (
          <p className="quick-files-selected">Wybrano pliki: {files.map((file) => file.name).join(', ')}</p>
        )}
        {kind === 'asset' ? (
          <div className="form-grid quick-asset-fields">
            <label>
              Producent
              <input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} />
            </label>
            <label>
              Model
              <input value={modelNumber} onChange={(event) => setModelNumber(event.target.value)} />
            </label>
          </div>
        ) : (
          <>
            <FormSelect
              label="Typ dokumentu"
              value={typeId}
              onChange={setTypeId}
              options={[
                { value: '', label: 'Brak typu' },
                ...documentTypes.map((type) => ({ value: type.id, label: type.name })),
              ]}
            />
            <label>
              <span>
                Notatka <small>opcjonalnie</small>
              </span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
            </label>
          </>
        )}
        <label>
          <span>
            Tagi <small>oddziel przecinkami</small>
          </span>
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="np. kuchnia, usługi" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button className="secondary" onClick={onClose} type="button">
            Anuluj
          </button>
          <button className="primary" disabled={busy || !name.trim()} type="submit">
            {busy ? 'Zapisywanie…' : kind === 'asset' ? 'Dodaj przedmiot' : 'Dodaj dokument'}
          </button>
        </footer>
      </form>
    </div>
  );
}
