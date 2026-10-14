import type { BinderDocument, CreateBinderDocumentInput, DocumentType } from '@boberit/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { downloadAttachment, previewAttachment } from '../attachments';
import { FormSelect } from '../components/FormSelect';
import { Icon } from '../components/Icon';
import { ocrStatusMeta } from '../labels';
import type { OcrStatus, OcrDetails } from '../types';

export function DocumentOcrPage({
  document,
  onBack,
  onDirtyChange,
  onRun,
  onSave,
  onUpdate,
  onDeleteFile,
}: {
  document: BinderDocument;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onRun: (id: string) => Promise<void>;
  onSave: (id: string, text: string) => Promise<void>;
  onUpdate: (id: string, input: Partial<CreateBinderDocumentInput>) => Promise<void>;
  onDeleteFile: (documentId: string, fileId: string) => Promise<void>;
}) {
  const [details, setDetails] = useState<OcrDetails>({
    status: (document.ocrStatus ?? 'pending') as OcrStatus,
    text: '',
    error: null,
    updatedAt: null,
  });
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(Boolean(document.ocrStatus));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [typeId, setTypeId] = useState(document.typeId ?? '');
  const [tags, setTags] = useState(document.tags.join(', '));
  const [notes, setNotes] = useState(document.notes ?? '');
  const [metadataBusy, setMetadataBusy] = useState(false);
  const formTags = tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const metadataDirty =
    typeId !== (document.typeId ?? '') ||
    JSON.stringify(formTags) !== JSON.stringify(document.tags) ||
    notes.trim() !== (document.notes ?? '');
  const hasUnsavedChanges = dirty || metadataDirty;
  function applyDetails(next: OcrDetails) {
    setDetails(next);
    setText(next.text);
    setDirty(false);
  }
  async function load() {
    if (!document.ocrStatus) {
      applyDetails({ status: 'pending', text: '', error: null, updatedAt: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.getDocumentOcr(document.id);
      applyDetails({
        status: response.data.status as OcrStatus,
        text: response.data.text,
        error: response.data.error,
        updatedAt: response.data.updated_at,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się odczytać OCR.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    void api.listDocumentTypes().then((r) => setTypes(r.data));
  }, [document.id]);
  useEffect(() => {
    if (metadataDirty) return;
    setTypeId(document.typeId ?? '');
    setTags(document.tags.join(', '));
    setNotes(document.notes ?? '');
  }, [document.typeId, document.tags, document.notes, metadataDirty]);
  useEffect(() => {
    onDirtyChange(hasUnsavedChanges);
    return () => onDirtyChange(false);
  }, [hasUnsavedChanges, onDirtyChange]);
  async function run() {
    if ((dirty || text.trim()) && !window.confirm('Ponowne OCR zastąpi obecny tekst i ręczne poprawki. Kontynuować?'))
      return;
    setBusy(true);
    setError('');
    setDetails((current) => ({ ...current, status: 'processing' }));
    try {
      await onRun(document.id);
      const response = await api.getDocumentOcr(document.id);
      applyDetails({
        status: response.data.status as OcrStatus,
        text: response.data.text,
        error: response.data.error,
        updatedAt: response.data.updated_at,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się wykonać OCR.');
      setDetails((current) => ({ ...current, status: 'failed' }));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      await onSave(document.id, text);
      setDetails((current) => ({
        ...current,
        status: 'completed',
        text,
        error: null,
        updatedAt: new Date().toISOString(),
      }));
      setDirty(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać tekstu OCR.');
    } finally {
      setBusy(false);
    }
  }
  async function removeFile(file: BinderDocument['files'][number]) {
    if (!window.confirm('Usunąć plik „' + file.originalName + '”? Treść OCR dokumentu zostanie przeliczona.')) return;
    setDeletingFileId(file.id);
    setError('');
    try {
      await onDeleteFile(document.id, file.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się usunąć załącznika.');
    } finally {
      setDeletingFileId(null);
    }
  }
  async function saveMetadata() {
    if (!metadataDirty || metadataBusy) return;
    setMetadataBusy(true);
    setError('');
    try {
      await onUpdate(document.id, { typeId: typeId || null, tags: formTags, notes });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać danych dokumentu.');
    } finally {
      setMetadataBusy(false);
    }
  }
  const meta = ocrStatusMeta(details.status);
  return (
    <>
      <button className="back" onClick={onBack} type="button">
        <Icon name="arrow-left" /> Wróć do dokumentów
      </button>
      <div className="detail-heading ocr-detail-heading">
        <div>
          <p className="eyebrow">Szczegóły dokumentu</p>
          <h1>{document.name}</h1>
          <p>
            {[
              document.type,
              document.files.length === 0
                ? 'Brak załączników'
                : document.files.length === 1
                  ? '1 załącznik'
                  : document.files.length < 5
                    ? String(document.files.length) + ' załączniki'
                    : String(document.files.length) + ' załączników',
            ]
              .filter(Boolean)
              .join(' · ') || 'Dokument bez załączników'}
          </p>
        </div>
        <span className={`ocr-detail-status ocr-status--${details.status}`}>
          <Icon name={meta.icon} />
          OCR: {meta.label}
        </span>
      </div>
      <div className="ocr-detail-layout">
        <aside className="ocr-source-panel">
          <section className="panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Dokument</p>
                <h2>Informacje</h2>
              </div>
              <button
                className={`secondary bright save-changes-button${metadataDirty ? ' is-pending' : ''}`}
                disabled={metadataBusy || !metadataDirty}
                onClick={() => void saveMetadata()}
                type="button"
              >
                {metadataBusy ? 'Zapisywanie…' : 'Zapisz dane'}
              </button>
            </div>
            <div className="document-detail-form">
              <FormSelect
                label="Typ"
                value={typeId}
                onChange={setTypeId}
                options={[
                  { value: '', label: 'Brak typu' },
                  ...types.map((type) => ({ value: type.id, label: type.name })),
                ]}
              />
              <label>
                Tagi
                <input
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="Oddziel przecinkami"
                />
              </label>
              <label>
                Notatka
                <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
            </div>
            <div className="ocr-source-heading">
              <p className="eyebrow">Pliki źródłowe</p>
              <h2>Załączniki</h2>
            </div>
            <div className="ocr-source-files">
              {document.files.map((file) => (
                <div key={file.id}>
                  <span>
                    <Icon name="file-text" />
                  </span>
                  <div>
                    <strong>{file.originalName}</strong>
                    <small>{file.mimeType}</small>
                  </div>
                  <div className="ocr-file-actions">
                    <button
                      className="text-action"
                      onClick={() =>
                        void previewAttachment(file.id, file.originalName).catch((reason: unknown) =>
                          setError(reason instanceof Error ? reason.message : 'Nie udało się otworzyć podglądu.'),
                        )
                      }
                      type="button"
                    >
                      Podgląd
                    </button>
                    <button
                      className="text-action"
                      onClick={() =>
                        void downloadAttachment(file.id, file.originalName).catch((reason: unknown) =>
                          setError(reason instanceof Error ? reason.message : 'Nie udało się pobrać pliku.'),
                        )
                      }
                      type="button"
                    >
                      Pobierz
                    </button>
                    <button
                      className="text-action danger-action ocr-file-delete"
                      disabled={deletingFileId === file.id}
                      onClick={() => void removeFile(file)}
                      type="button"
                    >
                      {deletingFileId === file.id ? 'Usuwanie…' : 'Usuń'}
                    </button>
                  </div>
                </div>
              ))}
              {!document.files.length && (
                <p className="subtle">Brak pliku źródłowego. Dodaj go z menu Akcje na liście dokumentów.</p>
              )}
            </div>
          </section>
        </aside>
        <section className="panel ocr-editor-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Rozpoznany tekst</p>
              <h2>Treść dokumentu</h2>
            </div>
            <div className="ocr-detail-actions">
              <button
                className="secondary"
                disabled={busy || loading || !document.files.length}
                onClick={() => void run()}
                type="button"
              >
                {busy && details.status === 'processing'
                  ? 'Rozpoznawanie…'
                  : details.status === 'pending'
                    ? 'Uruchom OCR'
                    : 'Uruchom ponownie OCR'}
              </button>
              <button
                className={`primary save-changes-button${dirty ? ' is-pending' : ''}`}
                disabled={busy || loading || !dirty}
                onClick={() => void save()}
                type="button"
              >
                Zapisz poprawki
              </button>
            </div>
          </div>
          {loading ? (
            <div className="ocr-loading">Wczytywanie tekstu OCR…</div>
          ) : (
            <textarea
              aria-label="Rozpoznany tekst OCR"
              className="ocr-text-editor"
              onChange={(event) => {
                const next = event.target.value;
                setText(next);
                setDirty(next !== details.text);
              }}
              placeholder="Po uruchomieniu OCR rozpoznany tekst pojawi się tutaj."
              value={text}
            />
          )}{' '}
          {(error || details.error) && <p className="form-error">{error || details.error}</p>}
          {details.updatedAt && (
            <p className="ocr-updated">Ostatnia aktualizacja: {new Date(details.updatedAt).toLocaleString('pl-PL')}</p>
          )}
        </section>
      </div>
    </>
  );
}
