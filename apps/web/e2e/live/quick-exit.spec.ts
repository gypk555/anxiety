import type { BrowserContext, Page } from '@playwright/test';
import { answerItems, expect, ORIGIN, seedAssessment, seedJournal, serviceWorkerActive, signUp, tabTo, test } from './support';

/**
 * Quick exit, through the real app. The neutral page is a local stub: nothing reaches Google. Its URL is the real one,
 * so the test proves where the browser was sent.
 */
const NEUTRAL = 'https://www.google.com/search?q=weather+today';

async function stubNeutralPage(context: BrowserContext, delayMs = 0) {
  await context.route('https://www.google.com/**', async (route) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>weather today</title><p>Weather</p>' });
  });
}

/**
 * Waits for the service worker's registration to finish. Exiting while its request is still in flight works, but WebKit
 * then reports the cancelled request as an uncaught error in the old page, which the guard would count.
 */
const settled = (page: Page) =>
  expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()) !== undefined), { timeout: 15_000 })
    .toBe(true);

const exitButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Quick exit' });

/** Quick exit from `path`, reached after `before`: the exited entry is replaced, so Back lands on `before`. */
async function exitReplacesEntry(page: Page, before: string, path: string) {
  await page.goto(before);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await settled(page);
  await page.goto(path);
  await expect(page.getByRole('status', { name: 'Loading' }), path).toHaveCount(0);
  await settled(page);
  const length = await page.evaluate(() => history.length);
  await exitButton(page).click();
  await page.waitForURL(NEUTRAL);
  expect(await page.evaluate(() => history.length), `${path}: no new entry was added`).toBe(length);
  await page.goBack();
  await expect(page, `${path}: Back skips the exited screen`).toHaveURL(`${ORIGIN}${before}`);
  await settled(page);
}

test.beforeEach(async ({ context, guard }) => {
  guard.allowHost('https://www.google.com');
  await stubNeutralPage(context);
});

test('from every guest screen, the screen is replaced in history by a neutral page', async ({ page }) => {
  for (const path of ['/', '/help', '/check-in', '/tools', '/tools/breathe', '/tools/ground', '/tools/sounds', '/safety-plan', '/safety-plan/edit', '/settings', '/sign-in', '/create-account', '/privacy', '/no-such-page']) {
    await exitReplacesEntry(page, '/about', path);
  }
});

test('from every signed-in screen too, without signing out or waiting for the network', async ({ page, context }) => {
  await signUp(page, 'exit');
  const saved = await seedAssessment(context, [1, 1, 1, 1, 1, 1, 1], 1);
  const entry = await seedJournal(context);
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/api/')) posts.push(r.url());
  });
  for (const path of ['/', '/trends', '/mood', '/report', '/journal', '/journal/new', `/journal/${entry.id}`, `/result/${saved.id}`, '/safety-plan', '/settings']) {
    await exitReplacesEntry(page, '/about', path);
  }
  expect(posts, 'quick exit sends nothing, sign-out included').toEqual([]);
});

test('mid check-in: the answers so far are cleared as well as hidden', async ({ page }) => {
  await page.goto('/about');
  await settled(page);
  await page.goto('/check-in');
  await page.getByRole('button', { name: 'Begin' }).click();
  await answerItems(page, [2, 3]);
  await expect(page).toHaveURL(/\/check-in\/3$/);
  await settled(page);
  expect(await page.evaluate(() => sessionStorage.getItem('anxiocare.checkin.v1'))).not.toBeNull();
  await exitButton(page).click();
  await page.waitForURL(NEUTRAL);
  await page.goBack();
  await expect(page).toHaveURL(/\/check-in\/2$/);
  await settled(page);
  expect(await page.evaluate(() => sessionStorage.getItem('anxiocare.checkin.v1'))).toBeNull();
});

test('the app is gone from the screen before the neutral page has even loaded', async ({ page, context }) => {
  await context.unroute('https://www.google.com/**');
  await stubNeutralPage(context, 3000);
  await page.goto('/sign-in');
  await settled(page);
  await page.getByLabel('Email address').fill('someone-private@example.com');
  await exitButton(page).click();
  // The old document is still here, waiting on the slow page: nothing of it may show, and its form text is gone.
  await expect(page.locator('#root')).toBeHidden({ timeout: 500 });
  expect(await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value).join(''))).toBe('');
  await page.waitForURL(NEUTRAL);
});

test('Escape three times exits, but not while typing in a field', async ({ page, guard }) => {
  guard.expectEscapeCancelsServiceWorkerCheck();
  await page.goto('/about');
  await page.goto('/sign-in');
  await settled(page);
  const email = page.getByLabel('Email address');
  await email.fill('typing');
  await email.focus();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.locator('h1').click();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Escape');
  await page.waitForURL(NEUTRAL);
  await page.goBack();
  await expect(page).toHaveURL(/\/about$/);
  await settled(page);
});

test('reachable by keyboard, and not held back by an unsaved draft', async ({ page, browserName }) => {
  await signUp(page, 'exit-draft');
  // An unsaved thought record would normally make the browser ask "Leave site?". Quick exit must not wait for that.
  await page.goto('/journal/new');
  await page.getByRole('textbox').fill('Something private');
  await settled(page);
  await tabTo(page, browserName, exitButton(page));
  await page.keyboard.press('Enter');
  await page.waitForURL(NEUTRAL);
});

test('not blocked by an open sheet, which makes the header unreachable', async ({ page }) => {
  await signUp(page, 'exit-modal');
  await page.goto('/settings');
  await settled(page);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Quick exit' }).click();
  await page.waitForURL(NEUTRAL);
});

test('offline, the app still leaves the screen at once', async ({ page, context, guard }) => {
  guard.expectOfflineErrors();
  await page.goto('/');
  await serviceWorkerActive(page);
  await page.goto('/help');
  await context.unroute('https://www.google.com/**');
  await context.setOffline(true);
  await exitButton(page).click();
  // The neutral page can't load, so the browser shows its own error page, or the old document with nothing showing.
  await expect
    .poll(async () => (page.url().startsWith(ORIGIN) ? page.locator('#root').isHidden().catch(() => true) : true))
    .toBe(true);
  await context.setOffline(false);
});
