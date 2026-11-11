import type { Page } from '@playwright/test';
import { api, browserStorageDump, expect, seedPlan, serviceWorkerActive, signInHere, signOut, signUp, takeCheckin, test, uniqueEmail } from './support';

/** Markers that must never be readable in the browser's storage, only in the app's own screens. */
const SIGN = 'MarkerSignNotSleeping';
const NAME = 'MarkerDidi';
const PHONE = '+91 98765 43210';
const REASON = 'MarkerMyNiece';

async function expectNothingReadableStored(page: Page, ...markers: string[]) {
  const dump = await browserStorageDump(page);
  for (const marker of [...markers, '98765', 'warningSigns', 'helpContacts']) {
    expect([marker, dump.includes(marker)], 'localStorage, sessionStorage or IndexedDB').toEqual([marker, false]);
  }
  return dump;
}

const hasRecord = async (page: Page, key: string) => (await browserStorageDump(page)).includes(`"${key}"`);

async function writeGuestPlan(page: Page) {
  await page.goto('/safety-plan/edit');
  await expect(page.getByText(/kept only on this device, encrypted/).first()).toBeVisible();
  await page.getByRole('group', { name: 'Warning signs that a hard time may be starting' }).getByRole('textbox', { name: 'Item 1' }).fill(SIGN);
  const people = page.getByRole('group', { name: 'People I can ask for help' });
  await people.getByRole('button', { name: 'Add a person' }).click();
  await people.getByRole('textbox', { name: 'Name 1' }).fill(NAME);
  await people.getByRole('textbox', { name: 'Phone 1' }).fill(PHONE);
  await page.getByRole('group', { name: /What matters most to me/ }).getByRole('textbox', { name: 'Item 1' }).fill(REASON);
  await page.getByRole('button', { name: 'Save your plan' }).click();
  await expect(page).toHaveURL(/\/safety-plan$/);
}

test('a guest makes a plan on this device, encrypted, and it opens offline with one-tap calls', async ({ page, context, guard }) => {
  guard.expectOfflineErrors();
  await page.goto('/');
  await serviceWorkerActive(page);
  await writeGuestPlan(page);
  await expect(page.getByRole('link', { name: `Call ${NAME}, ${PHONE}` })).toHaveAttribute('href', 'tel:+919876543210');
  const dump = await expectNothingReadableStored(page, SIGN, NAME, REASON);
  expect(dump).toContain('"extractable":false');
  // Nothing went to the server: a guest has no account to send it to.
  expect(await context.cookies()).toEqual([]);

  await context.setOffline(true);
  await page.goto('/safety-plan');
  await expect(page.getByText(SIGN)).toBeVisible();
  await expect(page.getByRole('link', { name: `Call ${NAME}, ${PHONE}` })).toHaveAttribute('href', 'tel:+919876543210');
  await expect(page.getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112');
  // Offline, a plan kept only on this device can still be changed or deleted.
  await expect(page.getByRole('link', { name: 'Change your plan' })).toBeVisible();
  await context.setOffline(false);
  await page.reload();

  // And the guest can delete it at any time.
  await page.getByRole('button', { name: 'Delete this plan' }).click();
  await page.getByRole('button', { name: 'Yes, delete it' }).click();
  await expect(page.getByRole('link', { name: 'Make your plan' })).toBeVisible();
  expect(await hasRecord(page, 'plan:guest')).toBe(false);
});

test('after signing in, a guest plan moves to the account and the device copy goes', async ({ page, context }) => {
  // An account that exists already, signed out, then a plan made as a guest on this phone.
  const email = await signUp(page, 'plan-move');
  await signOut(page);
  await writeGuestPlan(page);
  await page.goto('/sign-in?next=%2Fsafety-plan');
  await signInHere(page, email);
  await expect(page).toHaveURL(/\/safety-plan$/);
  await page.getByRole('button', { name: 'Move it to your account' }).click();
  await expect(page.getByRole('button', { name: 'Move it to your account' })).toHaveCount(0);
  await expect(page.getByText(REASON)).toBeVisible();

  const saved = await api(context).get('/safety-plan');
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({ warningSigns: [SIGN], helpContacts: [{ name: NAME, phone: PHONE }], reasonsToLive: [REASON] });
  await expect.poll(() => hasRecord(page, 'plan:guest')).toBe(false);
  await expectNothingReadableStored(page, SIGN, NAME, REASON);
});

test('a signed-in plan opens offline after one load, and signing out removes the device copy', async ({ page, context, guard }) => {
  guard.expectOfflineErrors();
  await signUp(page, 'plan-offline');
  await seedPlan(context, { warningSigns: [SIGN], helpContacts: [{ name: NAME, phone: PHONE }], reasonsToLive: [REASON] });
  await serviceWorkerActive(page);
  await page.goto('/safety-plan');
  await expect(page.getByText(/A copy is kept on this device, encrypted/)).toBeVisible();
  await expect.poll(() => hasRecord(page, 'plan:account')).toBe(true);
  await expectNothingReadableStored(page, SIGN, NAME, REASON);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(REASON)).toBeVisible();
  await expect(page.getByText(/You're offline. This is the copy saved on this device/)).toBeVisible();
  await expect(page.getByRole('link', { name: `Call ${NAME}, ${PHONE}` })).toHaveAttribute('href', 'tel:+919876543210');
  await context.setOffline(false);

  await signOut(page);
  await expect.poll(() => hasRecord(page, 'plan:account')).toBe(false);
  await context.setOffline(true);
  await page.goto('/safety-plan');
  await expect(page.getByRole('heading', { level: 1, name: 'Your safety plan' })).toBeVisible();
  await expect(page.getByText(REASON)).toHaveCount(0);
  await context.setOffline(false);
});

test('a second account on the same device never sees the first one\'s plan, online or offline', async ({ page, context, guard }) => {
  guard.expectOfflineErrors();
  await signUp(page, 'plan-first');
  await seedPlan(context, { reasonsToLive: [REASON], helpContacts: [{ name: NAME, phone: PHONE }] });
  await serviceWorkerActive(page);
  await page.goto('/safety-plan');
  await expect(page.getByText(REASON)).toBeVisible();
  await expect.poll(() => hasRecord(page, 'plan:account')).toBe(true);

  // The first session ends without a sign-out, as when it expires, and someone else signs in on this phone.
  await context.clearCookies();
  await page.goto('/safety-plan');
  await expect(page.getByRole('link', { name: 'Make your plan' })).toBeVisible();
  await expect(page.getByText(REASON)).toHaveCount(0);
  await page.goto('/sign-in?next=%2Fsafety-plan');
  await signUp(page, 'plan-second', uniqueEmail('plan-second'));
  await page.goto('/safety-plan');
  await expect(page.getByRole('link', { name: 'Make your plan' })).toBeVisible();
  await expect(page.getByText(REASON)).toHaveCount(0);
  await expect.poll(() => hasRecord(page, 'plan:account')).toBe(false);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Your safety plan' })).toBeVisible();
  await expect(page.getByText(REASON)).toHaveCount(0);
  await context.setOffline(false);
});

test('a signed-in person writes, changes and deletes their plan', async ({ page, context }) => {
  await signUp(page, 'plan-write');
  await page.goto('/tools');
  await page.getByRole('link', { name: /Safety plan/ }).click();
  await page.getByRole('link', { name: 'Make your plan' }).click();
  const people = page.getByRole('group', { name: 'Professionals and helplines' });
  await people.getByRole('button', { name: 'Add a professional' }).click();
  await people.getByRole('textbox', { name: 'Name 1' }).fill('Dr Iyer');
  await people.getByRole('textbox', { name: 'Phone 1' }).fill('(080) 2345-6789');
  await page.getByRole('button', { name: 'Save your plan' }).click();
  await expect(page.getByRole('link', { name: 'Call Dr Iyer, (080) 2345-6789' })).toHaveAttribute('href', 'tel:08023456789');
  await page.getByRole('link', { name: 'Change your plan' }).click();
  await page.getByRole('group', { name: 'Making my surroundings safer' }).getByRole('textbox', { name: 'Item 1' }).fill('Keep my tablets with Didi');
  await page.getByRole('button', { name: 'Save your plan' }).click();
  await expect(page.getByText('Keep my tablets with Didi')).toBeVisible();
  expect((await (await api(context).get('/safety-plan')).json()).saferSurroundings).toEqual(['Keep my tablets with Didi']);

  await page.getByRole('button', { name: 'Delete this plan' }).click();
  await page.getByRole('button', { name: 'Yes, delete it' }).click();
  await expect(page.getByRole('link', { name: 'Make your plan' })).toBeVisible();
  expect((await api(context).get('/safety-plan')).status()).toBe(404);
});

test('linked from Help and from the severe result', async ({ page }) => {
  await page.goto('/help');
  await page.getByRole('link', { name: 'Open your safety plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your safety plan' })).toBeVisible();
  await takeCheckin(page, [3, 3, 3, 3, 3, 3, 3], 3);
  await expect(page).toHaveURL(/\/result$/);
  await page.getByRole('link', { name: 'Open your safety plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your safety plan' })).toBeVisible();
});
