// Request body schemas. Limits are generous so that existing data never blocks saving another
// field (the web app sends whole forms); the data layer keeps its stricter business rules.
import { integer, number, oneOf, required, requiredText, shape, text, date, textList } from './validate.js';

const shortText = 500;
const longText = 20_000;
const identifier = 100;
export const passwordMaxLength = 1024;

const itemStatuses = ['available', 'reserved', 'in_use', 'in_repair', 'retired'] as const;
export const assetFileKinds = ['photo', 'receipt', 'manual', 'other'] as const;
const scheduleKinds = ['one_off', 'recurring'] as const;
const intervalUnits = ['days', 'weeks', 'months', 'years'] as const;
export const webhookEvents = [
  'asset.created',
  'asset.deleted',
  'document.created',
  'document.deleted',
  'maintenance.created',
  'maintenance.completed',
  'backup.exported',
  'backup.restored',
] as const;

const assetFields = {
  manufacturer: text('Producent', shortText),
  modelNumber: text('Model', shortText),
  serialNumber: text('Numer seryjny', shortText),
  purchaseDate: date('Data zakupu'),
  // Up to 100 billion in the main currency unit.
  priceMinor: integer('Cena', 0, 10_000_000_000_000),
  currency: text('Waluta', 10),
  quantity: number('Ilość', 0, 1_000_000),
  externalUrl: text('Link', 2048),
  notes: text('Notatki', longText),
  tags: textList('Tagi', 100, 100),
  itemStatus: oneOf('Status', itemStatuses, true),
  categoryId: text('Kategoria', identifier),
  locationId: text('Lokalizacja', identifier),
};
export const assetCreateInput = shape({ name: requiredText('Nazwa', shortText), ...assetFields });
export const assetUpdateInput = shape({ name: text('Nazwa', shortText), ...assetFields });

export const warrantyInput = shape({
  kind: required('Rodzaj gwarancji', oneOf('Rodzaj gwarancji', ['fixed', 'lifetime', 'unknown'] as const)),
  scope: text('Zakres gwarancji', shortText),
  expiresOn: date('Koniec gwarancji'),
});

export const fileKindInput = shape({ kind: required('Typ pliku', oneOf('Typ pliku', assetFileKinds)) });

const documentFields = {
  type: text('Typ dokumentu', shortText),
  typeId: text('Typ dokumentu', identifier),
  tags: textList('Tagi', 100, 100),
  notes: text('Notatki', longText),
};
export const documentCreateInput = shape({ name: requiredText('Nazwa', shortText), ...documentFields });
export const documentUpdateInput = shape({ name: text('Nazwa', shortText), ...documentFields });
export const ocrTextInput = shape({ text: text('Tekst OCR', 2_000_000) });

export const inboxAssignInput = shape({
  assetId: requiredText('Przedmiot', identifier),
  // An unknown kind falls back to "other", as before validation existed.
  kind: text('Typ pliku', 20),
});

const planFields = {
  title: requiredText('Nazwa czynności', shortText),
  scheduleKind: required('Typ terminu', oneOf('Typ terminu', scheduleKinds)),
  intervalValue: integer('Co ile', 1, 1000),
  intervalUnit: oneOf('Jednostka', intervalUnits, true),
  nextDueOn: date('Następny termin'),
  notes: text('Notatka', longText),
};
export const planInput = shape(planFields);
export const completionInput = shape({ performedOn: date('Data wykonania'), notes: text('Notatka', longText) });

export const nameInput = shape({ name: text('Nazwa', shortText) });
export const assetOptionInput = shape({
  kind: required('Typ słownika', oneOf('Typ słownika', ['category', 'location'] as const)),
  name: text('Nazwa', shortText),
});
export const householdNameInput = shape({ name: requiredText('Nazwa gospodarstwa', shortText) });
export const activeHouseholdInput = shape({ householdId: requiredText('Gospodarstwo', identifier) });
export const memberInput = shape({
  login: requiredText('Login', identifier),
  email: requiredText('E-mail', 320),
  password: requiredText('Hasło', passwordMaxLength),
  role: oneOf('Rola', ['owner', 'member'] as const),
});
export const roleInput = shape({ role: required('Rola', oneOf('Rola', ['owner', 'member'] as const)) });

export const registerInput = shape({
  setupToken: requiredText('Kod konfiguracji', 100),
  login: requiredText('Login', identifier),
  email: requiredText('E-mail', 320),
  password: requiredText('Hasło', passwordMaxLength),
  householdName: requiredText('Nazwa gospodarstwa', shortText),
});
export const loginInput = shape({
  login: requiredText('Login', identifier),
  password: requiredText('Hasło', passwordMaxLength),
});
export const passwordChangeInput = shape({
  currentPassword: text('Obecne hasło', passwordMaxLength),
  newPassword: requiredText('Nowe hasło', passwordMaxLength),
});
export const passwordConfirmationInput = shape({ password: text('Obecne hasło', passwordMaxLength) });

export const webhookInput = shape({
  name: requiredText('Nazwa', 200),
  url: requiredText('Adres', 2048),
  secret: text('Sekret', 500),
  events: required('Zdarzenia', textList('Zdarzenia', webhookEvents.length, 64)),
  householdIds: textList('Gospodarstwa', 100, identifier),
});
