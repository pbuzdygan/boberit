// Smoke scenario across the main screens. The first test performs first-run setup
// and seeds data; the rest depend on it, so the file runs in serial mode.
import {
  api,
  baseUrl,
  expect,
  fileForm,
  isoDate,
  login,
  nav,
  ownerToken,
  password,
  recordDialogs,
  test,
} from './fixtures.mjs';

test.describe.configure({ mode: 'serial' });

test('first-run setup in the UI, then seed test data', async ({ page }) => {
  await page.goto(baseUrl());
  await expect(page.getByRole('heading', { name: 'Utwórz pierwsze konto' })).toBeVisible();
  // A wrong setup code is rejected with a hint where to find the right one.
  await page.getByLabel('Kod konfiguracji').fill('WRONG-CODE-0000');
  await page.getByPlaceholder('Twój login').fill('owner');
  await page.getByPlaceholder('Adres e-mail').fill('owner@example.test');
  await page.getByPlaceholder('np. Nasz dom').fill('Dom testowy');
  await page.getByPlaceholder('Minimum 12 znaków').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('alert')).toContainText('Kod konfiguracji jest nieprawidłowy.');
  await page.getByLabel('Kod konfiguracji').fill(process.env.BOBERIT_E2E_SETUP_TOKEN);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('heading', { name: 'Dzień dobry.' })).toBeVisible();

  await test.step('seed test data through the API', async () => {
    const { token } = await api(null, 'POST', '/auth/login', { login: 'owner', password });
    const asset = await api(token, 'POST', '/assets', {
      name: 'Ekspres testowy',
      manufacturer: 'Sage',
      tags: ['Kuchnia'],
    });
    await api(token, 'PUT', `/assets/${asset.id}/warranty`, { kind: 'fixed', expiresOn: isoDate(10) });
    await api(token, 'POST', `/assets/${asset.id}/maintenance-plans`, {
      title: 'Odkamienianie',
      scheduleKind: 'recurring',
      intervalValue: 3,
      intervalUnit: 'months',
      nextDueOn: isoDate(0),
    });
    await api(token, 'POST', `/assets/${asset.id}/files`, fileForm('paragon.txt', 'Paragon testowy', 'text/plain'));
    const document = await api(token, 'POST', '/documents', { name: 'Umowa testowa' });
    await api(token, 'POST', `/documents/${document.id}/files`, fileForm('umowa.txt', 'Treść umowy', 'text/plain'));
    await api(token, 'POST', '/inbox/files', fileForm('skan.txt', 'Skan', 'text/plain'));
    const trashed = await api(token, 'POST', '/assets', { name: 'Stara lampa' });
    await api(token, 'DELETE', `/assets/${trashed.id}`);
    await api(token, 'POST', '/household/members', {
      login: 'member',
      email: 'member@example.test',
      password,
      role: 'member',
    });
  });
});

test('owner navigates the main screens', async ({ page }) => {
  await login(page, 'owner');
  await expect(page.getByText('Ekspres testowy').first()).toBeVisible();

  for (const [label, heading] of [
    ['Przedmioty', 'Przedmioty'],
    ['Dokumenty', 'Dokumenty'],
    ['Terminy', 'Terminy'],
    ['Do przypisania', 'Do przypisania'],
    ['Kosz', 'Kosz'],
    ['Ustawienia', 'Ustawienia'],
    ['Start', 'Dzień dobry.'],
  ]) {
    await nav(page, label);
    await expect(page.getByRole('heading', { name: heading, exact: true }), `navigation: ${label}`).toBeVisible();
  }

  await nav(page, 'Terminy');
  await expect(page.getByText('Odkamienianie').first()).toBeVisible();
  await nav(page, 'Kosz');
  await expect(page.getByText('Stara lampa')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Opróżnij kosz' })).toBeVisible();
});

test('item detail shows plan and attachment', async ({ page }) => {
  await login(page, 'owner');
  await nav(page, 'Przedmioty');
  await page.getByText('Ekspres testowy').first().click();
  await expect(page.getByRole('heading', { name: 'Ekspres testowy' })).toBeVisible();
  await expect(page.getByText('Co 3 miesiące', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Inne · 1 KB')).toBeVisible();
});

test('document preview opens exactly one tab with the file', async ({ page }) => {
  await login(page, 'owner');
  await nav(page, 'Dokumenty');
  await page.getByText('Umowa testowa').first().click();
  await expect(page.getByRole('heading', { name: 'Umowa testowa' })).toBeVisible();

  const context = page.context();
  const pagesBefore = context.pages().length;
  const [preview] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Podgląd' }).first().click(),
  ]);
  // The app opens the tab synchronously, then points it at the fetched blob.
  await preview.waitForURL(/^blob:/);
  await expect(preview.locator('body')).toContainText('Treść umowy');
  // A previous bug opened a second, empty tab shortly after the first.
  await page.waitForTimeout(1_000);
  expect(context.pages().length - pagesBefore).toBe(1);
  await preview.close();
});

// 1x1 PNG; the server re-encodes images on upload.
const pixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('image preview renders in its tab under the app CSP', async ({ page }) => {
  const token = await ownerToken();
  const document = await api(token, 'POST', '/documents', { name: 'Zdjęcie testowe' });
  await api(token, 'POST', `/documents/${document.id}/files`, fileForm('zdjecie.png', pixelPng, 'image/png'));
  await login(page, 'owner');
  await nav(page, 'Dokumenty');
  await page.getByText('Zdjęcie testowe').first().click();
  await expect(page.getByRole('heading', { name: 'Zdjęcie testowe' })).toBeVisible();

  const [preview] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('button', { name: 'Podgląd' }).first().click(),
  ]);
  await preview.waitForURL(/^blob:/);
  await expect.poll(() => preview.evaluate(() => document.querySelector('img')?.naturalWidth ?? 0)).toBeGreaterThan(0);
  await preview.close();
});

test('backup download requires the current password', async ({ page }) => {
  await login(page, 'owner');
  await nav(page, 'Ustawienia');
  const downloadButton = page.getByRole('button', { name: 'Pobierz backup' });
  const passwordInput = page.locator('label', { hasText: 'Obecne hasło' }).first().locator('input');
  await expect(downloadButton).toBeDisabled();

  await passwordInput.fill('wrong-password-1');
  await downloadButton.click();
  await expect(page.getByText('Obecne hasło jest nieprawidłowe.')).toBeVisible();

  await passwordInput.fill(password);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
  expect(download.suggestedFilename()).toMatch(/^boberit-backup-/);

  await page.locator('.settings-nav button', { hasText: 'Historia gospodarstwa' }).click();
  await expect(page.getByText('Pobrano backup')).toBeVisible();
});

test('member cannot manage backups or empty the trash', async ({ openPage }) => {
  const page = await openPage();
  await login(page, 'member');
  await nav(page, 'Ustawienia');
  await expect(page.getByText('Backupem i odtwarzaniem danych zarządza właściciel gospodarstwa.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pobierz backup' })).toHaveCount(0);
  await nav(page, 'Kosz');
  await expect(page.getByText('Stara lampa')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Opróżnij kosz' })).toHaveCount(0);
});

test('mobile layout uses bottom navigation without horizontal scroll', async ({ openPage }) => {
  const page = await openPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(page, 'owner');
  const mobileNav = page.locator('nav.mobile-nav');
  await expect(mobileNav).toBeVisible();
  await expect(page.locator('.nav-item', { hasText: 'Ustawienia' }).first()).toBeHidden();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, 'scrollWidth').toBeLessThanOrEqual(390);

  await mobileNav.getByText('Przedmioty').click();
  await expect(page.getByRole('heading', { name: 'Przedmioty', exact: true })).toBeVisible();
  await page.getByText('Ekspres testowy').first().click();
  await expect(page.getByRole('heading', { name: 'Ekspres testowy' })).toBeVisible();
});

test('item edit fills the warranty date, guards unsaved changes, and saves', async ({ page }) => {
  await api(await ownerToken(), 'POST', '/assets', { name: 'Odkurzacz testowy' });
  await login(page, 'owner');
  await nav(page, 'Przedmioty');
  await page.getByText('Odkurzacz testowy').first().click();
  await expect(page.getByRole('heading', { name: 'Odkurzacz testowy' })).toBeVisible();
  const save = page.getByRole('button', { name: 'Zapisz zmiany' });
  await expect(save).toBeDisabled();

  // A purchase date proposes a fixed warranty ending two years later.
  await page.getByLabel('Data zakupu').fill('2026-01-15');
  await expect(page.getByRole('button', { name: 'Rodzaj gwarancji' })).toHaveText('Z określoną datą');
  await expect(page.getByLabel('Koniec gwarancji')).toHaveValue('2028-01-15');
  await expect(save).toBeEnabled();

  const dialogs = recordDialogs(page, false);
  await nav(page, 'Start');
  expect(dialogs).toEqual(['Masz niezapisane zmiany w tym przedmiocie. Opuścić widok i je odrzucić?']);
  await expect(page.getByRole('heading', { name: 'Odkurzacz testowy' })).toBeVisible();

  await save.click();
  await expect(page.locator('.toast')).toHaveText('Gwarancję zapisano.');
  await expect(save).toBeDisabled();
  await nav(page, 'Start');
  await expect(page.getByRole('heading', { name: 'Dzień dobry.' })).toBeVisible();
  expect(dialogs).toHaveLength(1);

  await page.getByRole('button', { name: 'Powiadomienia' }).click();
  await expect(page.getByRole('dialog', { name: 'Powiadomienia' })).toContainText('Gwarancję zapisano.');

  await page.reload();
  await nav(page, 'Przedmioty');
  await page.getByText('Odkurzacz testowy').first().click();
  await expect(page.getByLabel('Data zakupu')).toHaveValue('2026-01-15');
  await expect(page.getByLabel('Koniec gwarancji')).toHaveValue('2028-01-15');
});

test('search finds items and documents and returns to the previous view', async ({ page }) => {
  await login(page, 'owner');
  await nav(page, 'Dokumenty');
  await expect(page.getByRole('heading', { name: 'Dokumenty', exact: true })).toBeVisible();

  const search = page.getByRole('textbox', { name: 'Szukaj w Boberit' });
  await page.locator('body').press('/');
  await expect(search).toBeFocused();
  await search.fill('testow');
  await expect(page.getByRole('heading', { name: '„testow”' })).toBeVisible();
  const results = page.locator('.search-results');
  await expect(results.getByText('Ekspres testowy')).toBeVisible();
  await expect(results.getByText('Umowa testowa')).toBeVisible();

  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Dokumenty', exact: true })).toBeVisible();

  await search.fill('umowa');
  await page.locator('.search-results').getByText('Umowa testowa').click();
  await expect(page.getByRole('heading', { name: 'Umowa testowa' })).toBeVisible();
});

test('a maintenance plan added from the item detail appears, and logout returns to sign-in', async ({ page }) => {
  await login(page, 'owner');
  await nav(page, 'Przedmioty');
  await page.getByText('Odkurzacz testowy').first().click();
  await expect(page.getByText('Brak planów konserwacji.')).toBeVisible();

  await page.locator('.detail-maintenance').getByRole('button', { name: 'Dodaj plan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowy plan' });
  await dialog.getByLabel('Nazwa czynności').fill('Wymiana filtra');
  await dialog.getByLabel('Następny termin').fill(isoDate(40));
  await dialog.getByRole('button', { name: 'Dodaj plan' }).click();
  await expect(page.locator('.toast')).toHaveText('Plan czynności został dodany.');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.plan', { hasText: 'Wymiana filtra' })).toContainText('Co 3 miesiące');

  await page.getByTitle('Konto użytkownika').click();
  await page.getByRole('menuitem', { name: 'Wyloguj się' }).click();
  await expect(page.getByPlaceholder('Twój login')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('boberit-session'))).toBeNull();
});

test('dialogs and file pickers work from the keyboard', async ({ page }) => {
  await login(page, 'owner');
  const add = page.locator('.topbar-save');
  await add.click();
  const dialog = page.getByRole('dialog', { name: 'Co chcesz dodać?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Nazwa przedmiotu')).toBeFocused();

  // Escape on an open select list closes only the list.
  await dialog.locator('.quick-kind-tabs button', { hasText: 'Dokument' }).click();
  await dialog.getByRole('button', { name: /Typ dokumentu/ }).press('ArrowDown');
  await expect(dialog.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('listbox')).toBeHidden();
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();

  // The inbox import picker can take keyboard focus (it used to be display: none).
  await nav(page, 'Do przypisania');
  const importInput = page.locator('.inbox-upload input[type="file"]');
  await importInput.focus();
  await expect(importInput).toBeFocused();
});
