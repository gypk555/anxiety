import { acceptConsent, answerItems, enterCode, expect, expectAccessible, expectNoOverflowAt320, requestCode, seedAssessment, seedJournal, test, uniqueEmail } from './support';
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
    for (const path of ['/', '/help', '/check-in', '/tools', '/tools/breathe', '/tools/ground', '/tools/sounds', '/settings', '/sign-in', '/privacy', '/terms', '/about', '/no-such-page']) {
      await page.goto(path);
      await check(page, path);
    }
    await page.goto('/check-in');
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
    test.setTimeout(120_000);
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
    await expect(page.getByRole('heading', { name: 'No check-ins saved yet' })).toBeVisible();
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
    await expect(page.getByText(email)).toBeVisible();
    await check(page, 'settings');

    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAccessible(page, 'delete sheet');
    await expectNoOverflowAt320(page, 'delete sheet');
    await page.getByRole('dialog').getByRole('button', { name: 'Keep my account' }).click();
  });
}

