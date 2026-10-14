// Shared helpers for the browser tests. Every page is watched for page errors,
// console errors, and unexpected HTTP errors; a test fails if any occur.
import { test as base, expect } from '@playwright/test';

export { expect };
export const password = 'correct-horse-battery';

export function baseUrl() {
  const url = process.env.BOBERIT_E2E_BASE_URL;
  if (!url) throw new Error('BOBERIT_E2E_BASE_URL is not set; run through `npm run test:e2e`.');
  return url;
}

function watch(page, problems) {
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    // The backup scenario submits a wrong password on purpose.
    const expected = response.status() === 401 && response.url().endsWith('/api/v1/settings/export');
    if (response.status() >= 400 && !expected) {
      problems.push(`HTTP ${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
    }
  });
  page.on('console', (message) => {
    // Unexpected 401 responses are reported by the response handler above.
    if (message.type() === 'error' && !message.text().includes('status of 401')) {
      problems.push(`console: ${message.text()}`);
    }
  });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const problems = [];
    watch(page, problems);
    // Preview tabs inherit the app's CSP, so their console errors count too.
    page.context().on('page', (opened) => watch(opened, problems));
    await use(page);
    expect(problems, 'browser errors').toEqual([]);
  },
  // Opens a page in a separate, watched browser context (other user or device).
  openPage: async ({ browser, locale, timezoneId, viewport }, use) => {
    const opened = [];
    await use(async (options = {}) => {
      const context = await browser.newContext({ locale, timezoneId, viewport, ...options });
      const page = await context.newPage();
      const problems = [];
      watch(page, problems);
      opened.push({ context, problems });
      return page;
    });
    for (const { context } of opened) await context.close();
    expect(
      opened.flatMap((entry) => entry.problems),
      'browser errors',
    ).toEqual([]);
  },
});

export async function api(token, method, path, body) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl()}/api/v1${path}`, { method, headers, body: payload });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  return text ? JSON.parse(text).data : null;
}

export function fileForm(name, content, type) {
  const form = new FormData();
  form.set('file', new File([content], name, { type }));
  return form;
}

// Calendar date in the server's time zone, so due dates do not shift near midnight.
export function isoDate(daysFromToday) {
  const date = new Date(Date.now() + daysFromToday * 86_400_000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(date);
}

export async function login(page, user) {
  await page.goto(baseUrl());
  await page.getByPlaceholder('Twój login').fill(user);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('heading', { name: 'Dzień dobry.' })).toBeVisible();
}

export async function nav(page, label) {
  await page.locator('.nav-item', { hasText: label }).first().click();
}

export async function ownerToken() {
  return (await api(null, 'POST', '/auth/login', { login: 'owner', password })).token;
}

// Records browser dialogs (confirm/alert) and answers them; Playwright would otherwise dismiss them silently.
export function recordDialogs(page, accept) {
  const messages = [];
  page.on('dialog', (dialog) => {
    messages.push(dialog.message());
    void (accept ? dialog.accept() : dialog.dismiss());
  });
  return messages;
}
