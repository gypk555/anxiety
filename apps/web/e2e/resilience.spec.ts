import { expect, test } from '@playwright/test';
import { GUEST_RESULT, RESULT_KEY, mockApi, seedSession } from './fixtures';

test('Help and tools work offline after one visit, and the service worker stores nothing from /api', async ({ page, context }) => {
  await mockApi(page);
  await page.goto('/');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active?.state !== 'activated') await new Promise((r) => reg.active?.addEventListener('statechange', r));
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await page.unrouteAll();
  await context.setOffline(true);
  await page.goto('/help');
  await expect(page.getByRole('link', { name: /Call 112/ })).toBeVisible();
  await expect(page.getByText("You're offline")).toBeVisible();
  await page.goto('/tools/breathe');
  await expect(page.getByRole('button', { name: 'Begin' })).toBeVisible();
  await page.goto('/tools/ground');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/privacy');
  await expect(page.getByText(/can't be loaded right now/)).toBeVisible();

  const cachedApi = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    }
    return urls.filter((u) => u.includes('/api'));
  });
  expect(cachedApi).toEqual([]);
});

// page.route can't see requests from a page a service worker controls (WebKit), so only the offline test uses one.
test.describe('without a service worker', () => {
  test.use({ serviceWorkers: 'block' });

  test('a chunk that fails to load leaves Get help working', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.route('**/assets/Tools-*.js', (route) => route.abort());
    await page.getByRole('link', { name: 'Tools', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: "This screen didn't load" })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: 'Go to Help' }).click();
    await expect(page.getByRole('link', { name: /Call 112/ })).toBeVisible();
  });

  test('signing out clears the guest result and returns to the first-run screen', async ({ page }) => {
    await mockApi(page, { signedIn: true });
    await seedSession(page, RESULT_KEY, GUEST_RESULT([1, 1, 1, 1, 1, 0, 0], 1));
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Sign out', exact: true }).last().waitFor();
    await page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true }).last().click();
    await expect(page.getByRole('heading', { level: 1, name: 'How have the last two weeks been?' })).toBeVisible();
    // addInitScript re-seeds on reload, so read the live tab's storage without reloading.
    expect(await page.evaluate(() => sessionStorage.getItem('anxiocare.result.v1'))).toBeNull();
    await page.unrouteAll();
    await mockApi(page, { signedIn: false });
    await page.goto('/trends');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });

  test('nothing in localStorage but the theme', async ({ page }) => {
    await mockApi(page);
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'Dark' }).click();
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['anxiocare-theme']);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('reduced motion: the breathing session still guides, with no scaling', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockApi(page);
    await page.goto('/tools/breathe');
    await page.getByRole('button', { name: 'Begin' }).click();
    await expect(page.getByRole('status')).toHaveText('Breathe in', { timeout: 6000 });
    const duration = await page.locator('.breath-layer').first().evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(duration).toBe('none');
  });

  test('static first paint offers help before any script has run', async ({ page }) => {
    await page.route('**/assets/*.js', (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('.boot-call').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.boot-call[href="tel:112"]')).toHaveText('Emergency: call 112');
  });
});
