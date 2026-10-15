import type {
  AssetSummary,
  CreateAssetInput,
  IntervalUnit,
  ItemStatus,
  MaintenancePlan,
  ScheduleKind,
  WarrantyKind,
} from '@boberit/shared';
import { addYearsToDate } from './format.ts';

/** Editable item fields as entered in the form (raw strings, trimmed only on comparison and save). */
export type AssetDetailsForm = {
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
  quantity: string;
  price: string;
  externalUrl: string;
  tags: string;
  notes: string;
  categoryId: string;
  locationId: string;
  itemStatus: ItemStatus;
};

/** `dateIsAutomatic` marks an end date proposed from the purchase date, which may be replaced again. */
export type WarrantyForm = { kind: WarrantyKind; scope: string; expiresOn: string; dateIsAutomatic: boolean };

export type PlanInput = Pick<
  MaintenancePlan,
  'title' | 'scheduleKind' | 'intervalValue' | 'intervalUnit' | 'nextDueOn' | 'notes'
>;

/** Default warranty length proposed from the purchase date. */
const defaultWarrantyYears = 2;

export function detailsFormFrom(asset: AssetSummary): AssetDetailsForm {
  return {
    name: asset.name,
    manufacturer: asset.manufacturer ?? '',
    model: asset.modelNumber ?? '',
    serialNumber: asset.serialNumber ?? '',
    purchaseDate: asset.purchaseDate ?? '',
    quantity: String(asset.quantity),
    price: asset.priceMinor === null ? '' : (asset.priceMinor / 100).toFixed(2),
    externalUrl: asset.externalUrl ?? '',
    tags: asset.tags.join(', '),
    notes: asset.notes ?? '',
    categoryId: asset.categoryId ?? '',
    locationId: asset.locationId ?? '',
    itemStatus: asset.itemStatus,
  };
}

export function warrantyFormFrom(asset: AssetSummary): WarrantyForm {
  return {
    kind: asset.warranty?.kind ?? 'unknown',
    scope: asset.warranty?.scope ?? '',
    expiresOn: asset.warranty?.expiresOn ?? '',
    dateIsAutomatic: false,
  };
}

export function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** Price in minor units; accepts a decimal comma. Empty input means no price. */
export function parsePriceMinor(value: string): number | null {
  return value.trim() ? Math.round(Number(value.replace(',', '.')) * 100) : null;
}

export function parseQuantity(value: string): number {
  return Math.max(1, Number(value) || 1);
}

export function isDetailsDirty(form: AssetDetailsForm, asset: AssetSummary): boolean {
  return (
    form.name.trim() !== asset.name ||
    form.manufacturer.trim() !== (asset.manufacturer ?? '') ||
    form.model.trim() !== (asset.modelNumber ?? '') ||
    form.serialNumber.trim() !== (asset.serialNumber ?? '') ||
    form.purchaseDate !== (asset.purchaseDate ?? '') ||
    parseQuantity(form.quantity) !== asset.quantity ||
    parsePriceMinor(form.price) !== asset.priceMinor ||
    form.externalUrl.trim() !== (asset.externalUrl ?? '') ||
    form.categoryId !== (asset.categoryId ?? '') ||
    form.locationId !== (asset.locationId ?? '') ||
    form.itemStatus !== asset.itemStatus ||
    JSON.stringify(parseTags(form.tags)) !== JSON.stringify(asset.tags) ||
    form.notes.trim() !== (asset.notes ?? '')
  );
}

export function isWarrantyDirty(form: WarrantyForm, asset: AssetSummary): boolean {
  return (
    form.kind !== (asset.warranty?.kind ?? 'unknown') ||
    form.scope.trim() !== (asset.warranty?.scope ?? '') ||
    (form.kind === 'fixed' && form.expiresOn !== (asset.warranty?.expiresOn ?? ''))
  );
}

export function detailsInput(form: AssetDetailsForm): Partial<CreateAssetInput> {
  return {
    name: form.name,
    manufacturer: form.manufacturer,
    modelNumber: form.model,
    serialNumber: form.serialNumber,
    purchaseDate: form.purchaseDate,
    quantity: parseQuantity(form.quantity),
    priceMinor: parsePriceMinor(form.price),
    externalUrl: form.externalUrl,
    tags: parseTags(form.tags),
    notes: form.notes,
    categoryId: form.categoryId || null,
    locationId: form.locationId || null,
    itemStatus: form.itemStatus,
  };
}

/**
 * Proposes a fixed warranty when a purchase date is entered and nothing better is known,
 * and withdraws a proposed date when the purchase date is cleared. Manual dates stay.
 */
export function warrantyAfterPurchaseDate(warranty: WarrantyForm, purchaseDate: string): WarrantyForm {
  if (!purchaseDate && warranty.dateIsAutomatic) {
    return { ...warranty, kind: 'unknown', expiresOn: '', dateIsAutomatic: false };
  }
  const canPropose =
    warranty.kind === 'unknown' || (warranty.kind === 'fixed' && (!warranty.expiresOn || warranty.dateIsAutomatic));
  if (purchaseDate && canPropose) {
    return {
      ...warranty,
      kind: 'fixed',
      expiresOn: addYearsToDate(purchaseDate, defaultWarrantyYears),
      dateIsAutomatic: true,
    };
  }
  return warranty;
}

export function warrantyAfterKindChange(
  warranty: WarrantyForm,
  kind: WarrantyKind,
  purchaseDate: string,
): WarrantyForm {
  if (kind === 'fixed' && purchaseDate && !warranty.expiresOn) {
    return { ...warranty, kind, expiresOn: addYearsToDate(purchaseDate, defaultWarrantyYears), dateIsAutomatic: true };
  }
  if (kind !== 'fixed') return { ...warranty, kind, dateIsAutomatic: false };
  return { ...warranty, kind };
}

export function newPlanInput(form: {
  title: string;
  kind: ScheduleKind;
  interval: string;
  unit: IntervalUnit;
  dueOn: string;
  notes: string;
}): PlanInput {
  return {
    title: form.title,
    scheduleKind: form.kind,
    intervalValue: form.kind === 'recurring' ? Math.max(1, Number(form.interval) || 1) : null,
    intervalUnit: form.kind === 'recurring' ? form.unit : null,
    nextDueOn: form.dueOn,
    notes: form.notes || null,
  };
}
