import { EMERGENCY_NUMBER, HELPLINES } from '@anxiocare/shared';
import { answerItems, api, enterCode, expect, requestCode, seedAssessment, seedJournal, serviceWorkerActive, signUp, test, uniqueEmail, waitForCode, giveName } from './support';
import type { Page } from '@playwright/test';

async function helpIsOneTapAway(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('status', { name: 'Loading' }), path).toHaveCount(0);
  const link = page.getByRole('banner').getByRole('link', { name: 'Get help' });
  await expect(link, path).toBeVisible();
  await link.click();
  await expect(page, path).toHaveURL(/\/help$/);
  await expect(page.getByRole('link', { name: `Call ${EMERGENCY_NUMBER.display}` }), path).toHaveAttribute('href', `tel:${EMERGENCY_NUMBER.tel}`);
}

async function expectHelplines(page: Page) {
  await expect(page.getByRole('link', { name: `Call ${EMERGENCY_NUMBER.display}` })).toHaveAttribute('href', `tel:${EMERGENCY_NUMBER.tel}`);
  for (const line of HELPLINES) {
    await expect(page.getByRole('link', { name: `Call ${line.display}` })).toHaveAttribute('href', `tel:${line.tel}`);
  }
}

test('Get help is on every guest route, without an account', async ({ page, context }) => {
  for (const path of ['/', '/help', '/check-in', '/tools', '/tools/breathe', '/tools/ground', '/tools/sounds', '/safety-plan', '/safety-plan/edit', '/settings', '/sign-in', '/privacy', '/terms', '/about', '/no-such-page']) {
    await helpIsOneTapAway(page, path);
  }
  await expectHelplines(page);
  expect(await context.cookies()).toEqual([]);
});

test('Get help is there mid check-in, and coming back loses no answers', async ({ page }) => {
  await page.goto('/check-in/gad7');
  await page.getByRole('button', { name: 'Begin' }).click();
  await answerItems(page, [1, 2, 3]);
  await expect(page).toHaveURL(/\/check-in\/4$/);

  await page.getByRole('banner').getByRole('link', { name: 'Get help' }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expectHelplines(page);

  await page.goBack();
  await expect(page).toHaveURL(/\/check-in\/4$/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/check-in\/3$/);
  await expect(page.getByRole('button', { name: 'Nearly every day' })).toHaveAttribute('aria-pressed', 'true');
});

test('Get help is on every signed-in route, in the consent gate, the code screen and on not found', async ({ page, context, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/assessments\//, 404);

  // Before consent.
  const email = uniqueEmail('safety');
  await requestCode(page, email);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Get help' })).toBeVisible();
  await enterCode(page, await waitForCode(email, 'login'));
  await expect(page.getByRole('heading', { level: 1, name: 'Before we save anything' })).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'Get help' }).click();
  await expect(page).toHaveURL(/\/help$/);
  await page.goto('/consent');
  await page.getByRole('checkbox', { name: 'I am 18 or older.' }).check();
  await page.getByRole('checkbox', { name: /I agree to AnxioCare storing/ }).check();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  // The name screen, like the consent gate, keeps Get help and Quick exit.
  await expect(page.getByRole('heading', { level: 1, name: 'What should we call you?' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Quick exit' })).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'Get help' }).click();
  await expect(page).toHaveURL(/\/help$/);
  await page.goto('/');
  await giveName(page);
  await expect(page.getByRole('heading', { level: 2, name: 'For right now' })).toBeVisible();

  const result = await seedAssessment(context, [1, 1, 1, 1, 1, 1, 1], 1);
  const entry = await seedJournal(context);
  for (const path of ['/', '/trends', '/mood', '/report', '/safety-plan', '/safety-plan/edit', '/journal', '/journal/new', `/journal/${entry.id}`, `/journal/${entry.id}/edit`, `/result/${result.id}`, '/settings', '/result/00000000-0000-4000-8000-000000000000']) {
    await helpIsOneTapAway(page, path);
  }
});

test('Help works offline, after one visit, with no account', async ({ page, context, guard }) => {
  guard.expectOfflineErrors();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await serviceWorkerActive(page);

  await context.setOffline(true);
  await page.goto('/help');
  await expectHelplines(page);
  await expect(page.getByText("You're offline. Help, breathing and grounding still work.")).toBeVisible();
  await page.reload();
  await expectHelplines(page);

  // Also from the tools, as someone waiting for a call might.
  await page.getByRole('link', { name: 'Breathe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Begin' })).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'Get help' }).click();
  await expectHelplines(page);
  expect(await context.cookies()).toEqual([]);
});

test('Help works offline mid check-in, when already signed in', async ({ page, context, guard }) => {
  guard.expectOfflineErrors();
  await signUp(page, 'offlinehelp');
  await serviceWorkerActive(page);
  await page.goto('/check-in/gad7');
  await page.getByRole('button', { name: 'Begin' }).click();
  await answerItems(page, [1]);
  await expect(page).toHaveURL(/\/check-in\/2$/);

  await context.setOffline(true);
  await page.getByRole('banner').getByRole('link', { name: 'Get help' }).click();
  await expectHelplines(page);
  await page.goto('/help');
  await expectHelplines(page);
  await context.setOffline(false);
  expect((await api(context).get('/me')).status()).toBe(200);
});

test('the service worker never serves or stores /api', async ({ page, context, guard }) => {
  guard.expectOfflineErrors();
  guard.expectHttpError(/^\/api\/v1\/nope$/, 404);
  await signUp(page, 'swapi');
  await seedJournal(context, { thought: 'Must not be cached' });
  await serviceWorkerActive(page);
  await page.goto('/journal');
  await expect(page.getByRole('link', { name: /Must not be cached/ })).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // The fixture also fails the test if any /api response at all came from the service worker.
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    }
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(cached.filter((u) => new URL(u).pathname.startsWith('/api'))).toEqual([]);

  // A navigation under /api is the server's answer, not the app shell.
  guard.expectCspViolation(); // WebKit shows JSON in its own viewer, which styles itself inline.
  const navigation = await page.goto('/api/v1/nope');
  expect(navigation?.status()).toBe(404);
  expect(navigation?.fromServiceWorker()).toBe(false);
  expect(navigation?.headers()['content-type']).toContain('application/problem+json');

  // Offline, the API fails rather than answering from anywhere.
  await page.goto('/help');
  guard.expectCspViolation(false);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.setOffline(true);
  const outcome = await page.evaluate(() => fetch('/api/v1/meta').then((r) => `answered ${r.status}`, () => 'failed'));
  expect(outcome).toBe('failed');
});
