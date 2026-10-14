import { createAsset, saveWarranty } from './assets.js';
import { database } from './database.js';
import { createMaintenancePlan } from './maintenance.js';
import type { Row } from './values.js';

export function seedDatabase(): void {
  const count = database.prepare('SELECT COUNT(*) AS count FROM assets').get() as Row;
  const household = database.prepare('SELECT id FROM households ORDER BY created_at LIMIT 1').get() as Row | undefined;
  if (Number(count.count) > 0 || !household) return;
  const householdId = String(household.id);
  const espresso = createAsset(householdId, {
    name: 'Ekspres Barista Pro',
    manufacturer: 'Sage',
    modelNumber: 'BES878',
    serialNumber: 'SES878BSS4EEU1',
    purchaseDate: '2024-09-16',
    tags: ['Kuchnia', 'AGD'],
    notes: 'Filtr wody: ClaroSwiss.',
  });
  saveWarranty(householdId, espresso.id, { kind: 'fixed', scope: 'Gwarancja producenta', expiresOn: '2026-09-16' });
  createMaintenancePlan(householdId, espresso.id, {
    title: 'Odkamienianie ekspresu',
    scheduleKind: 'recurring',
    intervalValue: 3,
    intervalUnit: 'months',
    nextDueOn: '2026-10-21',
  });
  createAsset(householdId, {
    name: 'Wiertarko-wkrętarka',
    manufacturer: 'Bosch',
    modelNumber: 'GSR 18V-55',
    serialNumber: '88102',
    purchaseDate: '2025-04-02',
    tags: ['Warsztat'],
  });
  createAsset(householdId, {
    name: 'Słuchawki QuietComfort',
    manufacturer: 'Bose',
    modelNumber: 'QC Ultra',
    purchaseDate: '2024-11-18',
    tags: ['Elektronika'],
  });
  createAsset(householdId, {
    name: 'Router domowy',
    manufacturer: 'TP-Link',
    modelNumber: 'AX55',
    tags: ['Elektronika'],
  });
}
