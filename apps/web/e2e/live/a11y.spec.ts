import { acceptConsent, answerItems, enterCode, expect, expectAccessible, expectNoOverflowAt320, localDay, requestCode, seedAssessment, seedJournal, seedMood, seedPlan, signUp, test, uniqueEmail, giveName, skipAboutYou } from './support';
import type { Page } from '@playwright/test';

async function check(page: Page, label: string) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0);
  await expectAccessible(page, label);
  await expectNoOverflowAt320(page, label);
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe and 320px, guest screens, ${theme}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    for (const path of ['/', '/help', '/check-in', '/check-in/gad7', '/tools', '/tools/breathe', '/tools/ground', '/tools/sounds', '/safety-plan', '/safety-plan/edit', '/settings', '/sign-in', '/privacy', '/terms', '/about', '/no-such-page']) {
      await page.goto(path);
      await check(page, path);
    }
    await page.goto('/check-in/gad7');
    await page.getByRole('button', { name: 'Begin' }).click();
    await check(page, 'question 1');
    await answerItems(page, [3, 3, 3, 3, 3, 3, 3]);
    await expect(page).toHaveURL(/\/difficulty$/);
    await check(page, 'difficulty');
    await page.getByRole('button', { name: 'Extremely difficult' }).click();
    await expect(page).toHaveURL(/\/result$/);
    await check(page, 'severe guest result');
  });

  test(`axe and 320px, signed-in screens with long real data, ${theme}`, async ({ page, context, guard }) => {
    test.setTimeout(240_000);
    guard.expectHttpError(/^\/api\/v1\/assessments\//, 404);
    await page.emulateMedia({ colorScheme: theme });
    // An address and words too long to wrap: the things that break a 320px layout in real use.
    const email = `${'a-very-long-mailbox-name-'.repeat(2)}${uniqueEmail('x')}`;
    const unbroken = 'Unbrokenwordthatwillnotwrapanywhereatallunlessthelayoutletsit'.repeat(2);

    const code = await requestCode(page, email);
    await check(page, 'code screen');
    await enterCode(page, code);
    await expect(page).toHaveURL(/\/consent/);
    await check(page, 'consent');
    await acceptConsent(page);
    await expect(page).toHaveURL(/\/name/);
    await check(page, 'name');
    await giveName(page, 'Asha', { about: 'stay' });
    await expect(page).toHaveURL(/\/about-you/);
    await check(page, 'about you');
    await skipAboutYou(page);
    await expect(page.getByText('Your first check-in')).toBeVisible();
    await check(page, 'empty home');
    await page.goto('/trends');
    await check(page, 'empty trends');
    await page.goto('/journal');
    await check(page, 'empty journal');

    await seedAssessment(context, [3, 3, 3, 3, 3, 3, 3], 3, new Date(Date.now() - 20 * 3_600_000).toISOString());
    const saved = await seedAssessment(context, [1, 1, 2, 1, 2, 1, 2], 2);
    const entry = await seedJournal(context, {
      situation: unbroken,
      thought: unbroken,
      feelings: ['Averyveryveryverylongfeelingwithnospace1'],
      evidenceFor: unbroken,
      evidenceAgainst: unbroken,
      balancedThought: unbroken,
    });

    await page.goto('/');
    await expect(page.getByText('Moderate, 10 out of 21')).toBeVisible();
    await check(page, 'home');
    await page.goto('/trends');
    await expect(page.getByRole('img', { name: /scores over time/ })).toBeVisible();
    await check(page, 'trends');
    await page.getByRole('button', { name: 'Show these as a table' }).click();
    await check(page, 'trends table');
    await page.goto(`/result/${saved.id}`);
    await check(page, 'saved result');
    await page.goto('/journal');
    await expect(page.getByRole('link', { name: /Unbroken/ })).toBeVisible();
    await check(page, 'journal');
    await page.goto(`/journal/${entry.id}`);
    await check(page, 'journal entry');
    await page.goto(`/journal/${entry.id}/edit?step=1`);
    await check(page, 'edit step 1');
    await page.goto(`/journal/${entry.id}/edit?step=3`);
    await check(page, 'edit step 3');
    await page.goto(`/journal/${entry.id}/edit?step=4`);
    await check(page, 'edit step 4');
    await page.goto(`/journal/${entry.id}/edit?step=5`);
    await check(page, 'edit step 5');
    await page.goto('/result/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('heading', { level: 1, name: "There's nothing at this address" })).toBeVisible();
    await check(page, 'result not found');
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Email', exact: true })).toHaveAccessibleDescription(email);
    await check(page, 'settings');

    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAccessible(page, 'delete sheet');
    await expectNoOverflowAt320(page, 'delete sheet');
    await page.getByRole('dialog').getByRole('button', { name: 'Keep my account' }).click();
  });

  test(`axe and 320px, mood log, safety plan and report with long real data, ${theme}`, async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: theme });
    const unbroken = 'Unbrokenwordthatwillnotwrapanywhereatallunlessthelayoutletsit'.repeat(2);
    await signUp(page, 'a11y-tracking');
    await seedAssessment(context, [1, 1, 2, 1, 2, 1, 2], 2);
    await seedJournal(context, { situation: unbroken });
    await page.goto('/mood');
    await check(page, 'empty mood log');
    await page.goto('/safety-plan');
    await check(page, 'empty safety plan');
    await seedMood(context, localDay(1), 2, unbroken.slice(0, 280));
    await seedMood(context, localDay(3), 4, 'A short walk helped.');
    await seedPlan(context, {
      warningSigns: [unbroken.slice(0, 200)],
      helpContacts: [{ name: unbroken.slice(0, 80), phone: '+91 98765 43210' }],
      reasonsToLive: ['My niece'],
    });
    await page.goto('/');
    await check(page, 'home with mood card');
    await page.goto('/mood');
    await expect(page.getByRole('list', { name: 'Days you logged' })).toBeVisible();
    await check(page, 'mood log');
    await page.getByRole('button', { name: /^Change/ }).first().click();
    await expectAccessible(page, 'mood day sheet');
    await expectNoOverflowAt320(page, 'mood day sheet');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await page.goto('/trends');
    await page.getByRole('button', { name: 'Show the mood log as a table' }).click();
    // Scrolled down, the sticky header covers part of the list, which axe counts as a small target.
    await page.evaluate(() => window.scrollTo(0, 0));
    await check(page, 'trends with mood table');
    await page.goto('/safety-plan');
    await expect(page.getByRole('link', { name: /Call Unbroken/ })).toBeVisible();
    await check(page, 'safety plan');
    await page.goto('/safety-plan/edit');
    await check(page, 'safety plan edit');
    await page.goto('/report');
    for (const name of ['Mood notes', 'Safety plan', 'Journal entries', 'Put my name at the top']) await page.getByRole('checkbox', { name }).check();
    await expect(page.getByRole('region', { name: 'Report preview' })).toContainText('A short walk helped.');
    await page.evaluate(() => window.scrollTo(0, 0));
    await check(page, 'report');

  });
}

