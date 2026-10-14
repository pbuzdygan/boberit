import type {
  AssetFileKind,
  AssetSummary,
  CreateAssetInput,
  ItemStatus,
  MaintenancePlan,
  WarrantyKind,
} from '@boberit/shared';
import { useState } from 'react';
import type { PlanInput } from '../assetForm';
import { downloadAttachment } from '../attachments';
import { ProvisionalFileKind, AddAssetFileControl } from '../components/AddAssetFileControl';
import { FormSelect } from '../components/FormSelect';
import { Icon } from '../components/Icon';
import { MaintenancePanel } from '../components/MaintenancePanel';
import { MaintenancePlanDialog } from '../components/MaintenancePlanDialog';
import { fileSize, formatTimestampDate } from '../format';
import { useAssetForm } from '../hooks/useAssetForm';
import { useAssetOptions } from '../hooks/useAssetOptions';
import { useReportError } from '../hooks/useReportError';
import { warrantyLabel, itemStatusMeta, fileKindLabels } from '../labels';

export function Detail({
  asset,
  onBack,
  onDirtyChange,
  onTrash,
  onUpdate,
  onWarranty,
  onPlan,
  onUpdatePlan,
  onDeletePlan,
  onUpload,
  onDeleteFile,
  onClassifyFile,
  onComplete,
}: {
  asset: AssetSummary;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onTrash: (id: string) => Promise<void>;
  onUpdate: (id: string, input: Partial<CreateAssetInput>) => Promise<void>;
  onWarranty: (id: string, kind: WarrantyKind, scope: string, expiresOn: string) => Promise<void>;
  onPlan: (id: string, input: PlanInput) => Promise<void>;
  onUpdatePlan: (id: string, input: PlanInput) => Promise<void>;
  onDeletePlan: (id: string) => Promise<void>;
  onUpload: (id: string, files: File[], kind: AssetFileKind) => Promise<void>;
  onDeleteFile: (assetId: string, fileId: string) => Promise<void>;
  onClassifyFile: (assetId: string, fileId: string, kind: AssetFileKind) => Promise<void>;
  onComplete: (plan: MaintenancePlan) => void;
}) {
  const form = useAssetForm({ asset, onDirtyChange, onUpdate, onWarranty });
  const { details, warranty: warrantyForm } = form;
  const assetOptions = useAssetOptions();
  const [editingPlan, setEditingPlan] = useState<MaintenancePlan | null>(null);
  const reportError = useReportError();
  const warranty = warrantyLabel(asset);
  return (
    <>
      <button className="back" type="button" onClick={onBack}>
        <Icon name="arrow-left" /> Wróć do przedmiotów
      </button>
      <div className="detail-heading">
        <div>
          <p className="eyebrow">
            {[asset.manufacturer, asset.modelNumber].filter(Boolean).join(' · ') || 'Przedmiot bez pełnych danych'}
          </p>
          <h1>{asset.name}</h1>
          {/* One line keeps a single text node; a formatter break would emit {' '} instead. */}
          {/* prettier-ignore */}
          <p>Dodano {formatTimestampDate(asset.createdAt)}. {asset.completeness === 'draft' ? 'To szkic — możesz go uzupełnić.' : 'Dane są gotowe do użycia.'}</p>
        </div>
        <div className="detail-heading-actions">
          <span className={`detail-status ${warranty.state}`}>{warranty.text}</span>
          <button
            className="text-action danger-action"
            onClick={() => {
              if (window.confirm(`Przenieść przedmiot „${asset.name}” do Kosza?`))
                void onTrash(asset.id).catch(reportError('Nie udało się przenieść przedmiotu do Kosza.'));
            }}
            type="button"
          >
            Usuń
          </button>
        </div>
      </div>
      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <header className="panel-title">
              <div>
                <p className="eyebrow">Dane przedmiotu</p>
                <h2>Informacje</h2>
              </div>
              <button
                className={`secondary bright save-asset-changes${form.hasUnsavedChanges ? ' is-pending' : ''}`}
                disabled={!form.hasUnsavedChanges || form.isSaving}
                onClick={() => void form.saveChanges().catch(reportError('Nie udało się zapisać zmian.'))}
                type="button"
              >
                {form.isSaving ? 'Zapisywanie…' : 'Zapisz zmiany'}
              </button>
            </header>
            <div className="field-grid asset-info-grid">
              <label>
                Nazwa
                <input value={details.name} onChange={(e) => form.setField('name', e.target.value)} />
              </label>
              <label>
                Producent
                <input value={details.manufacturer} onChange={(e) => form.setField('manufacturer', e.target.value)} />
              </label>
              <label>
                Model
                <input value={details.model} onChange={(e) => form.setField('model', e.target.value)} />
              </label>
              <label>
                Numer seryjny
                <input value={details.serialNumber} onChange={(e) => form.setField('serialNumber', e.target.value)} />
              </label>
              <FormSelect
                label="Kategoria"
                value={details.categoryId}
                onChange={(value) => form.setField('categoryId', value)}
                options={[
                  { value: '', label: 'Brak' },
                  ...assetOptions
                    .filter((option) => option.kind === 'category')
                    .map((option) => ({ value: option.id, label: option.name })),
                ]}
              />
              <FormSelect
                label="Status"
                value={details.itemStatus}
                onChange={(value) => form.setField('itemStatus', value as ItemStatus)}
                options={(Object.keys(itemStatusMeta) as ItemStatus[]).map((value) => ({
                  value,
                  label: itemStatusMeta[value].label,
                }))}
              />
              <FormSelect
                label="Lokalizacja"
                value={details.locationId}
                onChange={(value) => form.setField('locationId', value)}
                options={[
                  { value: '', label: 'Brak' },
                  ...assetOptions
                    .filter((option) => option.kind === 'location')
                    .map((option) => ({ value: option.id, label: option.name })),
                ]}
              />
              <label>
                Link
                <input
                  value={details.externalUrl}
                  onChange={(e) => form.setField('externalUrl', e.target.value)}
                  placeholder="https://…"
                  type="url"
                />
              </label>
              <label>
                Data zakupu
                <input
                  value={details.purchaseDate}
                  onChange={(e) => form.changePurchaseDate(e.target.value)}
                  type="date"
                />
              </label>
              <label>
                Ilość
                <input
                  min="1"
                  value={details.quantity}
                  onChange={(e) => form.setField('quantity', e.target.value)}
                  type="number"
                />
              </label>
              <label>
                Cena
                <input
                  min="0"
                  step="0.01"
                  value={details.price}
                  onChange={(e) => form.setField('price', e.target.value)}
                  type="number"
                />
              </label>
              <label>
                Tagi
                <input
                  value={details.tags}
                  onChange={(e) => form.setField('tags', e.target.value)}
                  placeholder="Kuchnia, AGD"
                />
              </label>
              <label className="span-all">
                Notatki
                <textarea
                  value={details.notes}
                  onChange={(e) => form.setField('notes', e.target.value)}
                  placeholder="Co warto pamiętać?"
                  rows={3}
                />
              </label>
            </div>
          </section>
          <section className="panel">
            <header className="panel-title">
              <div>
                <p className="eyebrow">Pliki</p>
                <h2>Dokumentacja</h2>
              </div>
              <AddAssetFileControl assetId={asset.id} onUpload={onUpload} />
            </header>
            {asset.files?.length ? (
              <div className="file-list">
                {asset.files.map((file) => (
                  <div className={`file-row${file.kindLocked ? '' : ' needs-kind'}`} key={file.id}>
                    <Icon name={file.kind === 'receipt' ? 'receipt' : 'file-text'} />
                    <button
                      className="file-download"
                      onClick={() =>
                        void downloadAttachment(file.id, file.originalName).catch(
                          reportError('Nie udało się pobrać pliku.'),
                        )
                      }
                      type="button"
                    >
                      <strong>{file.originalName}</strong>
                      {/* One line keeps a single text node; a formatter break would emit {' '} instead. */}
                      {/* prettier-ignore */}
                      <small>{file.kindLocked ? fileKindLabels[file.kind] : 'Typ do określenia'} · {fileSize(file.byteSize)}</small>
                    </button>
                    {!file.kindLocked && (
                      <ProvisionalFileKind assetId={asset.id} fileId={file.id} onSave={onClassifyFile} />
                    )}
                    <button
                      aria-label={'Usuń ' + file.originalName}
                      className="text-action danger-action file-delete"
                      onClick={() => {
                        if (window.confirm('Usunąć plik „' + file.originalName + '”?'))
                          void onDeleteFile(asset.id, file.id).catch(reportError('Nie udało się usunąć pliku.'));
                      }}
                      type="button"
                    >
                      Usuń
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="file-placeholder">
                <Icon name="receipt" />
                <div>
                  <strong>Paragon, instrukcja i zdjęcia</strong>
                  <p>
                    Dodaj je z komputera lub telefonu — Boberit przypisze je do tego przedmiotu. Maksymalnie 25 MB na
                    plik.
                  </p>
                </div>
              </div>
            )}
          </section>
          <MaintenancePanel
            asset={asset}
            onEdit={setEditingPlan}
            onComplete={onComplete}
            onDeletePlan={onDeletePlan}
            onPlan={onPlan}
          />
        </div>
        <aside className="detail-aside">
          <section className="warranty-card">
            <Icon name="shield-check" />
            <p className="eyebrow">Gwarancja</p>
            <h2>{warranty.text}</h2>
            <p>Ustaw zakres i datę, aby Boberit mógł przypomnieć o końcu ochrony.</p>
            <FormSelect
              className="warranty-kind-select"
              hideLabel
              label="Rodzaj gwarancji"
              value={warrantyForm.kind}
              onChange={(value) => form.changeWarrantyKind(value as WarrantyKind)}
              options={[
                { value: 'unknown', label: 'Brak danych' },
                { value: 'fixed', label: 'Z określoną datą' },
                { value: 'lifetime', label: 'Dożywotnia' },
              ]}
            />
            <input
              value={warrantyForm.scope}
              onChange={(e) => form.changeWarrantyScope(e.target.value)}
              placeholder="Zakres gwarancji"
            />
            {warrantyForm.kind === 'fixed' && (
              <input
                value={warrantyForm.expiresOn}
                onChange={(e) => form.changeWarrantyEnd(e.target.value)}
                type="date"
                required
              />
            )}
          </section>
        </aside>
      </div>
      {editingPlan && (
        <MaintenancePlanDialog
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSave={async (input) => {
            await onUpdatePlan(editingPlan.id, input);
            setEditingPlan(null);
          }}
        />
      )}
    </>
  );
}
