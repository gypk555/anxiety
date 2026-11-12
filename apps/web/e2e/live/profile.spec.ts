import type { Locator, Page } from '@playwright/test';
import { acceptConsent, api, enterCode, expect, expectAccessible, expectNoOverflowAt320, giveName, requestCode, seedAssessment, signUp, test, uniqueEmail } from './support';

/** Taps a chip, as a person would: the input inside it is visually hidden. */
const tap = (scope: Page | Locator, group: string, choice: string) =>
  scope.getByRole(group === 'What tends to cause you stress?' ? 'group' : 'radiogroup', { name: group }).locator('label', { hasText: choice }).click();

test('About you after the name: chosen details are kept, shown back, suggest tools, and can be cleared', async ({ page, context }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('about');
  await enterCode(page, await requestCode(page, email));
  await acceptConsent(page);
  await giveName(page, 'Asha', { about: 'stay' });
  await expect(page).toHaveURL(/\/about-you\?next=%2F$/);
  await expect(page.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
  // Get help and Quick exit stay in reach, as on every screen.
  await expect(page.getByRole('banner').getByRole('link', { name: 'Get help' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Quick exit' })).toBeVisible();
  await expectAccessible(page, 'about you');
  await expectNoOverflowAt320(page, 'about you');

  await tap(page, 'Avatar', 'Ocean Breeze');
  await expect(page.getByRole('radio', { name: 'Ocean Breeze' })).toBeChecked();
  await tap(page, 'Age range', '25 to 34');
  await tap(page, 'What tends to cause you stress?', 'Sleep');
  await expect(page.getByRole('checkbox', { name: 'Sleep' })).toBeChecked();
  await page.getByRole('button', { name: 'Save' }).click();

  // Home: the suggestions, and the avatar in the header.
  await expect(page.getByRole('heading', { level: 2, name: 'Tools that may help' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Slow-exhale breathing/ })).toHaveAttribute('href', '/tools/breathe');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Settings, Ocean Breeze' })).toBeVisible();
  expect((await (await api(context).get('/me')).json()) as object).toMatchObject({ aboutSeen: true, profile: { avatar: 'ocean', ageRange: '25-34', stressFactors: ['sleep'] } });

  // Never asked again.
  await page.goto('/about-you');
  await expect(page.getByRole('heading', { level: 2, name: 'For right now' })).toBeVisible();

  // The report's About me section, off by default.
  await page.goto('/report');
  const box = page.getByRole('checkbox', { name: 'About me' });
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(box).toBeChecked();
  await expect(page.getByRole('region', { name: 'About me' })).toContainText('25 to 34');

  // Settings: everything can be cleared.
  await page.goto('/settings');
  await page.getByRole('button', { name: 'About you' }).click();
  const sheet = page.getByRole('dialog', { name: 'About you' });
  await expectAccessible(page, 'about you sheet');
  await tap(sheet, 'Avatar', 'Your initial');
  await tap(sheet, 'Age range', 'Not set');
  await tap(sheet, 'What tends to cause you stress?', 'Sleep');
  await expect(sheet.getByRole('checkbox', { name: 'Sleep' })).not.toBeChecked();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Details saved')).toBeVisible();
  expect((await (await api(context).get('/me')).json()) as object).toMatchObject({ profile: {} });
  await expect(page.getByRole('banner').getByRole('link', { name: /^Settings,/ })).toHaveCount(0);
});

test('Skip for now is remembered, and the account goes straight on', async ({ page, context }) => {
  await signUp(page, 'skipper');
  expect((await (await api(context).get('/me')).json()) as object).toMatchObject({ aboutSeen: true, profile: {} });
  await page.goto('/about-you?next=%2Ftrends');
  await expect(page).toHaveURL(/\/trends$/);
});

test('Delete all check-ins names the count and removes only check-ins', async ({ page, context }) => {
  await signUp(page, 'wipe');
  for (let i = 0; i < 2; i += 1) await seedAssessment(context, [1, 1, 1, 1, 1, 1, 1], 1);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete all check-ins' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete all check-ins?' });
  await expect(confirm).toContainText('All 2 of your saved check-ins will be deleted');
  await confirm.getByRole('button', { name: 'Delete 2 check-ins' }).click();
  await expect(page.getByText('2 check-ins deleted')).toBeVisible();
  expect(await api(context).items('/assessments')).toEqual([]);
});

test('the breathing screen counts breaths, quietly', async ({ page }) => {
  await page.goto('/tools/breathe');
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page.getByText('Breath 1')).toBeVisible({ timeout: 8_000 });
});
