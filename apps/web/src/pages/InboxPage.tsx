import type { AssetFileKind, AssetSummary, CreateBinderDocumentInput, DocumentType, InboxFile } from '@boberit/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { downloadAttachment } from '../attachments';
import { FormSelect } from '../components/FormSelect';
import { Icon } from '../components/Icon';
import { fileSize, formatTimestampDate } from '../format';
import { useReportError } from '../hooks/useReportError';

export function InboxPage({
  files,
  assets,
  onUpload,
  onAssign,
  onToDocument,
  onDelete,
}: {
  files: InboxFile[];
  assets: AssetSummary[];
  onUpload: (files: File[]) => Promise<void>;
  onAssign: (id: string, assetId: string, kind: AssetFileKind) => Promise<void>;
  onToDocument: (id: string, input: CreateBinderDocumentInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const reportError = useReportError();
  useEffect(() => {
    void api.listDocumentTypes().then((r) => setDocumentTypes(r.data));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Masowy import</p>
          <h1>Do przypisania</h1>
          <p>Dodaj pliki teraz. Przypisz je do przedmiotów albo zachowaj jako dokument później.</p>
        </div>
        <div className="inbox-capture-actions">
          <label className="primary inbox-upload">
            Import
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.doc,.docx"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                if (files.length) void onUpload(files).catch(reportError('Nie udało się dodać plików.'));
              }}
            />
          </label>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Do uporządkowania</p>
          <h2>
            Pliki w Skrzynce <em>{files.length}</em>
          </h2>
        </div>
      </div>
      <div className="inbox-list">
        {files.map((file) => (
          <InboxRow
            file={file}
            assets={assets}
            documentTypes={documentTypes}
            key={file.id}
            onAssign={onAssign}
            onToDocument={onToDocument}
            onDelete={onDelete}
          />
        ))}
        {files.length === 0 && (
          <div className="empty">
            <Icon name="file-text" />
            <strong>Brak plików do przypisania</strong>
            <p>Dodaj plik z telefonu lub komputera. Pojawi się tutaj, dopóki go nie uporządkujesz.</p>
          </div>
        )}
      </div>
    </>
  );
}
function InboxRow({
  file,
  assets,
  documentTypes,
  onAssign,
  onToDocument,
  onDelete,
}: {
  file: InboxFile;
  assets: AssetSummary[];
  documentTypes: DocumentType[];
  onAssign: (id: string, assetId: string, kind: AssetFileKind) => Promise<void>;
  onToDocument: (id: string, input: CreateBinderDocumentInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [target, setTarget] = useState<'asset' | 'binder'>('asset');
  const [assetId, setAssetId] = useState('');
  const [kind, setKind] = useState<AssetFileKind>('receipt');
  const [name, setName] = useState(file.originalName.replace(/\.[^/.]+$/, ''));
  const [typeId, setTypeId] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const reportError = useReportError();
  async function submit() {
    setBusy(true);
    try {
      if (target === 'asset' && assetId) await onAssign(file.id, assetId, kind);
      if (target === 'binder' && name.trim())
        await onToDocument(file.id, {
          name,
          typeId: typeId || null,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          notes,
        });
    } catch (error) {
      reportError(target === 'asset' ? 'Nie udało się przypisać pliku.' : 'Nie udało się utworzyć dokumentu.')(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="inbox-row inbox-row--expanded">
      <span className="inbox-file-icon">
        <Icon name="file-text" />
      </span>
      <div className="inbox-file-copy">
        <strong>{file.originalName}</strong>
        <small>
          {file.mimeType || 'plik'} · {fileSize(file.byteSize)} · dodano {formatTimestampDate(file.createdAt)}
        </small>
        <span className="inbox-file-links">
          <button
            className="text-action"
            onClick={() =>
              void downloadAttachment(file.id, file.originalName).catch(reportError('Nie udało się pobrać pliku.'))
            }
            type="button"
          >
            Pobierz
          </button>
          <button
            className="text-action danger-action"
            onClick={() => {
              if (
                window.confirm(
                  `Usunąć plik „${file.originalName}” z listy Do przypisania? Tej operacji nie można cofnąć.`,
                )
              )
                void onDelete(file.id).catch(reportError('Nie udało się usunąć pliku.'));
            }}
            type="button"
          >
            Usuń
          </button>
        </span>
      </div>
      <div className="inbox-target">
        <div className="inbox-target-tabs">
          <button className={target === 'asset' ? 'active' : ''} onClick={() => setTarget('asset')} type="button">
            Przedmiot
          </button>
          <button className={target === 'binder' ? 'active' : ''} onClick={() => setTarget('binder')} type="button">
            Dokument
          </button>
        </div>
        {target === 'asset' ? (
          <div className="inbox-assign">
            <FormSelect
              disabled={!assets.length}
              hideLabel
              label="Przedmiot"
              value={assetId}
              onChange={setAssetId}
              options={[
                { value: '', label: 'Wybierz przedmiot…' },
                ...assets.map((asset) => ({ value: asset.id, label: asset.name })),
              ]}
            />
            <FormSelect
              hideLabel
              label="Rodzaj pliku"
              value={kind}
              onChange={(value) => setKind(value as AssetFileKind)}
              options={[
                { value: 'receipt', label: 'Paragon' },
                { value: 'manual', label: 'Instrukcja' },
                { value: 'photo', label: 'Zdjęcie' },
                { value: 'other', label: 'Inne' },
              ]}
            />
            <button className="secondary" disabled={!assetId || busy} onClick={() => void submit()} type="button">
              {busy ? 'Przypisywanie…' : 'Przypisz'}
            </button>
          </div>
        ) : (
          <div className="inbox-document-fields">
            <input
              aria-label="Nazwa dokumentu"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nazwa dokumentu"
            />
            <FormSelect
              hideLabel
              label="Typ dokumentu"
              value={typeId}
              onChange={setTypeId}
              options={[
                { value: '', label: 'Brak typu' },
                ...documentTypes.map((type) => ({ value: type.id, label: type.name })),
              ]}
            />
            <input
              aria-label="Tagi"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="Tagi, po przecinku"
            />
            <input
              aria-label="Notatka"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notatka"
            />
            <button className="secondary" disabled={!name.trim() || busy} onClick={() => void submit()} type="button">
              {busy ? 'Zapisywanie…' : 'Dodaj do Dokumentów'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
