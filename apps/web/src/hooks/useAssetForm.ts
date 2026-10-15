import type { AssetSummary, CreateAssetInput, WarrantyKind } from '@boberit/shared';
import { useEffect, useState } from 'react';
import {
  type AssetDetailsForm,
  detailsFormFrom,
  detailsInput,
  isDetailsDirty,
  isWarrantyDirty,
  warrantyAfterKindChange,
  warrantyAfterPurchaseDate,
  warrantyFormFrom,
} from '../assetForm';

/**
 * Edit state of the item detail form (details and warranty). The form starts from `asset`;
 * the detail view is keyed by asset ID, so another item gets a fresh form.
 */
export function useAssetForm({
  asset,
  onDirtyChange,
  onUpdate,
  onWarranty,
}: {
  asset: AssetSummary;
  onDirtyChange: (dirty: boolean) => void;
  onUpdate: (id: string, input: Partial<CreateAssetInput>) => Promise<void>;
  onWarranty: (id: string, kind: WarrantyKind, scope: string, expiresOn: string) => Promise<void>;
}) {
  const [details, setDetails] = useState(() => detailsFormFrom(asset));
  const [warranty, setWarranty] = useState(() => warrantyFormFrom(asset));
  const [isSaving, setIsSaving] = useState(false);
  const detailsDirty = isDetailsDirty(details, asset);
  const warrantyDirty = isWarrantyDirty(warranty, asset);
  const hasUnsavedChanges = detailsDirty || warrantyDirty;

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges);
    return () => onDirtyChange(false);
  }, [hasUnsavedChanges, onDirtyChange]);

  function setField<K extends keyof AssetDetailsForm>(field: K, value: AssetDetailsForm[K]) {
    setDetails((current) => ({ ...current, [field]: value }));
  }

  function changePurchaseDate(value: string) {
    setField('purchaseDate', value);
    setWarranty((current) => warrantyAfterPurchaseDate(current, value));
  }

  function changeWarrantyKind(kind: WarrantyKind) {
    setWarranty((current) => warrantyAfterKindChange(current, kind, details.purchaseDate));
  }

  function changeWarrantyScope(scope: string) {
    setWarranty((current) => ({ ...current, scope }));
  }

  function changeWarrantyEnd(expiresOn: string) {
    setWarranty((current) => ({ ...current, expiresOn, dateIsAutomatic: false }));
  }

  async function saveChanges() {
    if (!hasUnsavedChanges || isSaving) return;
    setIsSaving(true);
    try {
      if (detailsDirty) await onUpdate(asset.id, detailsInput(details));
      if (warrantyDirty) await onWarranty(asset.id, warranty.kind, warranty.scope, warranty.expiresOn);
    } finally {
      setIsSaving(false);
    }
  }

  return {
    details,
    warranty,
    isSaving,
    hasUnsavedChanges,
    setField,
    changePurchaseDate,
    changeWarrantyKind,
    changeWarrantyScope,
    changeWarrantyEnd,
    saveChanges,
  };
}
