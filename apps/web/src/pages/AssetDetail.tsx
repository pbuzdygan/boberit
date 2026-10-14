import type {
  AssetFileKind,
  AssetOption,
  AssetSummary,
  CreateAssetInput,
  IntervalUnit,
  ItemStatus,
  MaintenancePlan,
  MaintenanceRecord,
  ScheduleKind,
  WarrantyKind,
} from '@boberit/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { downloadAttachment } from '../attachments';
import { ProvisionalFileKind, AddAssetFileControl } from '../components/AddAssetFileControl';
import { FormSelect } from '../components/FormSelect';
import { Icon } from '../components/Icon';
import { MaintenancePlanDialog } from '../components/MaintenancePlanDialog';
import { formatDate, addYearsToDate, fileSize } from '../format';
import { warrantyLabel, itemStatusMeta, fileKindLabels, intervalLabel } from '../labels';

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
  onPlan: (
    id: string,
    input: Pick<MaintenancePlan, 'title' | 'scheduleKind' | 'intervalValue' | 'intervalUnit' | 'nextDueOn' | 'notes'>,
  ) => Promise<void>;
  onUpdatePlan: (
    id: string,
    input: Pick<MaintenancePlan, 'title' | 'scheduleKind' | 'intervalValue' | 'intervalUnit' | 'nextDueOn' | 'notes'>,
  ) => Promise<void>;
  onDeletePlan: (id: string) => Promise<void>;
  onUpload: (id: string, files: File[], kind: AssetFileKind) => Promise<void>;
  onDeleteFile: (assetId: string, fileId: string) => Promise<void>;
  onClassifyFile: (assetId: string, fileId: string, kind: AssetFileKind) => Promise<void>;
  onComplete: (plan: MaintenancePlan) => void;
}) {
  const [name, setName] = useState(asset.name);
  const [manufacturer, setManufacturer] = useState(asset.manufacturer ?? '');
  const [model, setModel] = useState(asset.modelNumber ?? '');
  const [serialNumber, setSerialNumber] = useState(asset.serialNumber ?? '');
  const [purchaseDate, setPurchaseDate] = useState(asset.purchaseDate ?? '');
  const [quantity, setQuantity] = useState(String(asset.quantity));
  const [price, setPrice] = useState(asset.priceMinor === null ? '' : (asset.priceMinor / 100).toFixed(2));
  const [externalUrl, setExternalUrl] = useState(asset.externalUrl ?? '');
  const [tags, setTags] = useState(asset.tags.join(', '));
  const [notes, setNotes] = useState(asset.notes ?? '');
  const [categoryId, setCategoryId] = useState(asset.categoryId ?? '');
  const [locationId, setLocationId] = useState(asset.locationId ?? '');
  const [itemStatus, setItemStatus] = useState<ItemStatus>(asset.itemStatus);
  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([]);
  const [kind, setKind] = useState<WarrantyKind>(asset.warranty?.kind ?? 'unknown');
  const [scope, setScope] = useState(asset.warranty?.scope ?? '');
  const [expiresOn, setExpiresOn] = useState(asset.warranty?.expiresOn ?? '');
  const [warrantyDateIsAutomatic, setWarrantyDateIsAutomatic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MaintenancePlan | null>(null);
  const [planTitle, setPlanTitle] = useState('');
  const [planDue, setPlanDue] = useState('');
  const [planKind, setPlanKind] = useState<ScheduleKind>('recurring');
  const [planInterval, setPlanInterval] = useState('3');
  const [planUnit, setPlanUnit] = useState<IntervalUnit>('months');
  const [planNotes, setPlanNotes] = useState('');
  const warranty = warrantyLabel(asset);
  const formTags = tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const formPriceMinor = price.trim() ? Math.round(Number(price.replace(',', '.')) * 100) : null;
  const detailsDirty =
    name.trim() !== asset.name ||
    manufacturer.trim() !== (asset.manufacturer ?? '') ||
    model.trim() !== (asset.modelNumber ?? '') ||
    serialNumber.trim() !== (asset.serialNumber ?? '') ||
    purchaseDate !== (asset.purchaseDate ?? '') ||
    Math.max(1, Number(quantity) || 1) !== asset.quantity ||
    formPriceMinor !== asset.priceMinor ||
    externalUrl.trim() !== (asset.externalUrl ?? '') ||
    categoryId !== (asset.categoryId ?? '') ||
    locationId !== (asset.locationId ?? '') ||
    itemStatus !== asset.itemStatus ||
    JSON.stringify(formTags) !== JSON.stringify(asset.tags) ||
    notes.trim() !== (asset.notes ?? '');
  const storedWarrantyKind = asset.warranty?.kind ?? 'unknown';
  const warrantyDirty =
    kind !== storedWarrantyKind ||
    scope.trim() !== (asset.warranty?.scope ?? '') ||
    (kind === 'fixed' && expiresOn !== (asset.warranty?.expiresOn ?? ''));
  const hasUnsavedChanges = detailsDirty || warrantyDirty;

  async function saveChanges() {
    if (!hasUnsavedChanges || isSaving) return;
    setIsSaving(true);
    try {
      if (detailsDirty)
        await onUpdate(asset.id, {
          name,
          manufacturer,
          modelNumber: model,
          serialNumber,
          purchaseDate,
          quantity: Math.max(1, Number(quantity) || 1),
          priceMinor: formPriceMinor,
          externalUrl,
          tags: formTags,
          notes,
          categoryId: categoryId || null,
          locationId: locationId || null,
          itemStatus,
        });
      if (warrantyDirty) await onWarranty(asset.id, kind, scope, expiresOn);
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges);
    return () => onDirtyChange(false);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    void api.listAssetOptions().then((response) => setAssetOptions(response.data));
  }, []);

  function changePurchaseDate(value: string) {
    setPurchaseDate(value);
    if (!value && warrantyDateIsAutomatic) {
      setKind('unknown');
      setExpiresOn('');
      setWarrantyDateIsAutomatic(false);
    } else if (value && (kind === 'unknown' || (kind === 'fixed' && (!expiresOn || warrantyDateIsAutomatic)))) {
      setKind('fixed');
      setExpiresOn(addYearsToDate(value, 2));
      setWarrantyDateIsAutomatic(true);
    }
  }

  function changeWarrantyKind(next: WarrantyKind) {
    setKind(next);
    if (next === 'fixed' && purchaseDate && !expiresOn) {
      setExpiresOn(addYearsToDate(purchaseDate, 2));
      setWarrantyDateIsAutomatic(true);
    } else if (next !== 'fixed') {
      setWarrantyDateIsAutomatic(false);
    }
  }
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
          <p>Dodano {formatDate(asset.createdAt.slice(0, 10))}. {asset.completeness === 'draft' ? 'To szkic — możesz go uzupełnić.' : 'Dane są gotowe do użycia.'}</p>
        </div>
        <div className="detail-heading-actions">
          <span className={`detail-status ${warranty.state}`}>{warranty.text}</span>
          <button
            className="text-action danger-action"
            onClick={() => {
              if (window.confirm(`Przenieść przedmiot „${asset.name}” do Kosza?`)) void onTrash(asset.id);
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
                className={`secondary bright save-asset-changes${hasUnsavedChanges ? ' is-pending' : ''}`}
                disabled={!hasUnsavedChanges || isSaving}
                onClick={() => void saveChanges()}
                type="button"
              >
                {isSaving ? 'Zapisywanie…' : 'Zapisz zmiany'}
              </button>
            </header>
            <div className="field-grid asset-info-grid">
              <label>
                Nazwa
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Producent
                <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
              </label>
              <label>
                Model
                <input value={model} onChange={(e) => setModel(e.target.value)} />
              </label>
              <label>
                Numer seryjny
                <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
              </label>
              <FormSelect
                label="Kategoria"
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  { value: '', label: 'Brak' },
                  ...assetOptions
                    .filter((option) => option.kind === 'category')
                    .map((option) => ({ value: option.id, label: option.name })),
                ]}
              />
              <FormSelect
                label="Status"
                value={itemStatus}
                onChange={(value) => setItemStatus(value as ItemStatus)}
                options={(Object.keys(itemStatusMeta) as ItemStatus[]).map((value) => ({
                  value,
                  label: itemStatusMeta[value].label,
                }))}
              />
              <FormSelect
                label="Lokalizacja"
                value={locationId}
                onChange={setLocationId}
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
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://…"
                  type="url"
                />
              </label>
              <label>
                Data zakupu
                <input value={purchaseDate} onChange={(e) => changePurchaseDate(e.target.value)} type="date" />
              </label>
              <label>
                Ilość
                <input min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" />
              </label>
              <label>
                Cena
                <input min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} type="number" />
              </label>
              <label>
                Tagi
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Kuchnia, AGD" />
              </label>
              <label className="span-all">
                Notatki
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                      onClick={() => void downloadAttachment(file.id, file.originalName)}
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
                          void onDeleteFile(asset.id, file.id);
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
          <section className="panel">
            <header className="panel-title">
              <div>
                <p className="eyebrow">Czynności</p>
                <h2>Konserwacja</h2>
              </div>
            </header>
            <div className="plan-list">
              {asset.maintenancePlans?.length ? (
                asset.maintenancePlans.map((plan) => (
                  <div className="plan" key={plan.id}>
                    <span>
                      <Icon name="tool" />
                    </span>
                    <div>
                      <strong>{plan.title}</strong>
                      <small>
                        {plan.status === 'completed'
                          ? 'Czynność zakończona'
                          : `${plan.scheduleKind === 'recurring' ? `${intervalLabel(plan)} · ` : ''}następny termin: ${formatDate(plan.nextDueOn)}`}
                      </small>
                    </div>
                    <div className="plan-actions">
                      <button className="text-action" onClick={() => setEditingPlan(plan)} type="button">
                        Edytuj
                      </button>
                      {plan.status === 'active' ? (
                        <button className="secondary" type="button" onClick={() => onComplete(plan)}>
                          Wykonane
                        </button>
                      ) : (
                        <span className="plan-completed">Wykonane</span>
                      )}
                      <button
                        aria-label={'Usuń plan ' + plan.title}
                        className="text-action danger-action"
                        onClick={() => {
                          if (window.confirm('Usunąć plan „' + plan.title + '” wraz z historią wykonań?'))
                            void onDeletePlan(plan.id);
                        }}
                        type="button"
                      >
                        Usuń
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="subtle">Brak planów konserwacji.</p>
              )}
            </div>
            <div className="maintenance-history">
              <p className="eyebrow">Historia</p>
              <h3>Wykonane czynności</h3>
              {asset.maintenanceRecords?.length ? (
                <div className="history-list">
                  {asset.maintenanceRecords.map((record: MaintenanceRecord) => (
                    <div className="history-row" key={record.id}>
                      <span>
                        <Icon name="tool" />
                      </span>
                      <div>
                        <strong>{record.planTitle}</strong>
                        <small>
                          Wykonano {formatDate(record.performedOn)}
                          {record.dueOn ? ` · termin: ${formatDate(record.dueOn)}` : ''}
                        </small>
                        {record.notes && <p>{record.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="subtle">Jeszcze nie zapisano wykonanych czynności.</p>
              )}
            </div>
            <form
              className="plan-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (planTitle && planDue) {
                  void onPlan(asset.id, {
                    title: planTitle,
                    scheduleKind: planKind,
                    intervalValue: planKind === 'recurring' ? Math.max(1, Number(planInterval) || 1) : null,
                    intervalUnit: planKind === 'recurring' ? planUnit : null,
                    nextDueOn: planDue,
                    notes: planNotes || null,
                  });
                  setPlanTitle('');
                  setPlanDue('');
                  setPlanNotes('');
                }
              }}
            >
              <div className="plan-form-grid">
                <label>
                  Nazwa czynności
                  <input
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    placeholder="np. Wymiana filtra"
                    required
                  />
                </label>
                <FormSelect
                  label="Typ terminu"
                  value={planKind}
                  onChange={(value) => setPlanKind(value as ScheduleKind)}
                  options={[
                    { value: 'recurring', label: 'Cyklicznie' },
                    { value: 'one_off', label: 'Konkretna data' },
                  ]}
                />
                <label>
                  Następny termin
                  <input value={planDue} onChange={(e) => setPlanDue(e.target.value)} type="date" required />
                </label>
                {planKind === 'recurring' && (
                  <>
                    <label>
                      Co ile
                      <input
                        min="1"
                        value={planInterval}
                        onChange={(e) => setPlanInterval(e.target.value)}
                        type="number"
                        required
                      />
                    </label>
                    <FormSelect
                      label="Jednostka"
                      value={planUnit}
                      onChange={(value) => setPlanUnit(value as IntervalUnit)}
                      options={[
                        { value: 'days', label: 'Dni' },
                        { value: 'weeks', label: 'Tygodnie' },
                        { value: 'months', label: 'Miesiące' },
                        { value: 'years', label: 'Lata' },
                      ]}
                    />
                  </>
                )}
                <label className="span-all">
                  Notatka <small>opcjonalnie</small>
                  <input
                    value={planNotes}
                    onChange={(e) => setPlanNotes(e.target.value)}
                    placeholder="np. filtr HEPA, numer części"
                  />
                </label>
              </div>
              <button className="secondary plan-submit" type="submit">
                Dodaj plan
              </button>
            </form>
          </section>
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
              value={kind}
              onChange={(value) => changeWarrantyKind(value as WarrantyKind)}
              options={[
                { value: 'unknown', label: 'Brak danych' },
                { value: 'fixed', label: 'Z określoną datą' },
                { value: 'lifetime', label: 'Dożywotnia' },
              ]}
            />
            <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Zakres gwarancji" />
            {kind === 'fixed' && (
              <input
                value={expiresOn}
                onChange={(e) => {
                  setExpiresOn(e.target.value);
                  setWarrantyDateIsAutomatic(false);
                }}
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
