import type { BinderDocument, CreateBinderDocumentInput } from '@boberit/shared';
import { Fragment, useEffect, useRef, useState } from 'react';
import { DocumentEditDialog } from '../components/DocumentEditDialog';
import { Icon } from '../components/Icon';
import { OcrStatusIcon } from '../components/OcrStatusIcon';
import { formatTimestampDate } from '../format';
import { useDocumentTypes } from '../hooks/useDocumentTypes';
import { useReportError } from '../hooks/useReportError';
import { AssetColumnHeader } from './ItemsPage';

export function BinderPage({
  documents,
  onOpenOcr,
  onUpdate,
  onBatchOcr,
  onUpload,
  onTrash,
  onAdd,
}: {
  documents: BinderDocument[];
  onOpenOcr: (document: BinderDocument) => void;
  onUpdate: (id: string, input: Partial<CreateBinderDocumentInput>) => Promise<void>;
  onBatchOcr: () => Promise<void>;
  onUpload: (id: string, files: File[]) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
  onAdd: () => void;
}) {
  const types = useDocumentTypes();
  const [typeFilter, setTypeFilter] = useState('');
  const [groupByType, setGroupByType] = useState(false);
  const reportError = useReportError();
  const overdueOcrCount = documents.filter(
    (document) =>
      document.files.length > 0 &&
      (!document.ocrStatus || document.ocrStatus === 'pending' || document.ocrStatus === 'failed'),
  ).length;
  const visible = documents.filter(
    (document) => !typeFilter || (typeFilter === 'none' ? !document.typeId : document.typeId === typeFilter),
  );
  const groups = groupByType
    ? [...new Map(visible.map((document) => [document.typeId ?? 'none', document.type || 'Bez typu'])).entries()]
        .map(([key, label]) => ({
          key,
          label,
          documents: visible.filter((document) => (document.typeId ?? 'none') === key),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pl'))
    : [{ key: 'all', label: '', documents: visible }];
  const typeOptions = [
    ...types.map((type) => ({ value: type.id, label: type.name })),
    { value: 'none', label: 'Bez typu' },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dokumenty niezależne</p>
          <h1>Dokumenty</h1>
          <p>Umowy, faktury, potwierdzenia i pełnotekstowe wyszukiwanie OCR.</p>
        </div>
        <button
          className="secondary"
          disabled={!overdueOcrCount}
          onClick={() => void onBatchOcr().catch(reportError('Nie udało się uruchomić OCR.'))}
          type="button"
        >
          OCR zaległych dokumentów <span className="ocr-batch-count">{overdueOcrCount}</span>
        </button>
      </div>
      <div className="document-table-wrap">
        <table className="document-table">
          <thead>
            <tr>
              <th>Dokument</th>
              <th>
                <AssetColumnHeader
                  filterValue={typeFilter}
                  grouped={groupByType}
                  label="Typ"
                  onFilter={setTypeFilter}
                  onGroup={() => setGroupByType((value) => !value)}
                  options={typeOptions}
                />
              </th>
              <th>Tagi</th>
              <th>Dodano</th>
              <th>OCR</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.key}>
                {groupByType && (
                  <tr className="document-group-row">
                    <td colSpan={6}>
                      <strong>{group.label}</strong>
                      <span>{group.documents.length}</span>
                    </td>
                  </tr>
                )}
                {group.documents.map((document) => (
                  <DocumentTableRow
                    document={document}
                    key={document.id}
                    onOpenOcr={onOpenOcr}
                    onUpdate={onUpdate}
                    onUpload={onUpload}
                    onTrash={onTrash}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {documents.length === 0 ? (
          <div className="empty">
            <Icon name="file-text" />
            <strong>Nie masz jeszcze żadnych dokumentów</strong>
            <p>Dodaj umowę, fakturę lub polisę. Tekst z plików zostanie rozpoznany i będzie można go wyszukać.</p>
            <button className="primary" onClick={onAdd} type="button">
              Dodaj dokument
            </button>
          </div>
        ) : (
          visible.length === 0 && (
            <div className="empty">
              <Icon name="file-text" />
              <strong>Brak dokumentów tego typu</strong>
              <button className="secondary" onClick={() => setTypeFilter('')} type="button">
                Pokaż wszystkie
              </button>
            </div>
          )
        )}
      </div>
    </>
  );
}

function DocumentTableRow({
  document,
  onOpenOcr,
  onUpdate,
  onUpload,
  onTrash,
}: {
  document: BinderDocument;
  onOpenOcr: (document: BinderDocument) => void;
  onUpdate: (id: string, input: Partial<CreateBinderDocumentInput>) => Promise<void>;
  onUpload: (id: string, files: File[]) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const reportError = useReportError();
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.document.addEventListener('mousedown', close);
    window.document.addEventListener('keydown', escape);
    return () => {
      window.document.removeEventListener('mousedown', close);
      window.document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);
  function openDetails() {
    if (!menuOpen) onOpenOcr(document);
  }
  return (
    <tr
      className="document-table-row"
      onClick={openDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetails();
        }
      }}
      role="link"
      tabIndex={0}
    >
      <td className="document-name-cell">
        <span className="document-kind-icon">
          <Icon name="file-text" />
        </span>
        <strong>{document.name}</strong>
      </td>
      <td data-label="Typ">{document.type || '—'}</td>
      <td data-label="Tagi">
        <span className="document-tags">
          {document.tags.length ? document.tags.map((tag) => <i key={tag}>{tag}</i>) : '—'}
        </span>
      </td>
      <td data-label="Dodano">{formatTimestampDate(document.createdAt)}</td>
      <td className="document-ocr-cell" data-label="OCR">
        {/* Without a file there is nothing to recognize, so no OCR status applies. */}
        {document.files.length ? (
          <OcrStatusIcon status={document.ocrStatus} />
        ) : (
          <span aria-label="OCR: brak pliku" title="Brak pliku do rozpoznania">
            —
          </span>
        )}
      </td>
      <td
        className="document-actions-cell"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="document-actions" ref={menuRef}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="document-actions-trigger"
            onClick={() => setMenuOpen((open) => !open)}
            title="Akcje dokumentu"
            type="button"
          >
            <Icon label="Akcje dokumentu" name="dots" />
          </button>
          {menuOpen && (
            <div className="document-actions-menu" role="menu">
              <label className="document-action-upload">
                Dodaj plik
                <input
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = '';
                    if (files.length)
                      void onUpload(document.id, files)
                        .then(() => setMenuOpen(false))
                        .catch(reportError('Nie udało się dodać pliku do dokumentu.'));
                  }}
                  type="file"
                />
              </label>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
                role="menuitem"
                type="button"
              >
                Edytuj dane
              </button>
              <button
                className="danger-action"
                onClick={() => {
                  setMenuOpen(false);
                  if (window.confirm('Przenieść dokument „' + document.name + '” do Kosza?'))
                    void onTrash(document.id).catch(reportError('Nie udało się przenieść dokumentu do Kosza.'));
                }}
                role="menuitem"
                type="button"
              >
                Usuń
              </button>
            </div>
          )}
        </div>
        {editing && <DocumentEditDialog document={document} onClose={() => setEditing(false)} onSave={onUpdate} />}
      </td>
    </tr>
  );
}
