import { GAD7_MAX_SCORE, HELPLINES, scoreGad7, severityFor } from '@anxiocare/shared';
import { answerItems, expect, expectGuestHome, readGuestResult, resultHeading, takeCheckin, test } from './support';
import { guidanceFor } from '../../src/lib/result-guidance';

const CASES: { name: string; answers: number[]; difficulty: number | null; expected: string }[] = [
  { name: 'all zero skips the difficulty item', answers: [0, 0, 0, 0, 0, 0, 0], difficulty: null, expected: 'minimal' },
  { name: 'top of minimal', answers: [1, 1, 1, 1, 0, 0, 0], difficulty: 0, expected: 'minimal' },
  { name: 'bottom of mild', answers: [1, 1, 1, 1, 1, 0, 0], difficulty: 1, expected: 'mild' },
  { name: 'bottom of moderate', answers: [2, 2, 2, 1, 1, 1, 1], difficulty: 2, expected: 'moderate' },
  { name: 'bottom of severe', answers: [3, 3, 3, 2, 2, 1, 1], difficulty: 3, expected: 'severe' },
  { name: 'maximum', answers: [3, 3, 3, 3, 3, 3, 3], difficulty: 3, expected: 'severe' },
];

for (const { name, answers, difficulty, expected } of CASES) {
  test(`guest result: ${name}`, async ({ page, context }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() !== 'GET') posts.push(r.url());
    });

    await takeCheckin(page, answers, difficulty);
    await expect(page).toHaveURL(/\/result$/);

    const score = scoreGad7(answers);
    const band = severityFor(score);
    expect(band.severity).toBe(expected);
    await expect(resultHeading(page)).toContainText(`${band.label} range`);
    await expect(resultHeading(page)).toContainText(`${score} out of ${GAD7_MAX_SCORE}`);
    const guidance = guidanceFor(score);
    await expect(page.getByRole('heading', { name: guidance.title })).toBeVisible();
    await expect(page.getByText(guidance.message)).toBeVisible();
    await expect(page.getByRole('region', { name: /than last time|same as last time/ })).toHaveCount(0);
    await expect(page.getByText('This is a screening, not a diagnosis.')).toBeVisible();

    await expect(page.getByText('Talk to a professional')).toBeVisible({ visible: band.recommendProfessional });
    if (band.severity === 'severe') {
      await expect(page.getByRole('link', { name: `Call ${HELPLINES[0]!.display}` })).toHaveAttribute('href', `tel:${HELPLINES[0]!.tel}`);
    }

    // Only in this tab, and never sent anywhere.
    const stored = await readGuestResult(page);
    expect(stored?.answers).toEqual(answers);
    expect(stored?.difficulty).toBe(difficulty);
    const local = await page.evaluate(() => Object.entries(localStorage));
    expect(local.filter(([key]) => key !== 'anxiocare-theme')).toEqual([]);
    expect(JSON.stringify(local)).not.toContain(stored!.clientRequestId);
    expect(await context.cookies()).toEqual([]);
    expect(posts).toEqual([]);
  });
}

test('a guest result survives a refresh, and is gone once the tab is closed', async ({ page, context }) => {
  const answers = [2, 1, 2, 1, 2, 1, 2];
  await takeCheckin(page, answers, 1);
  await expect(page).toHaveURL(/\/result$/);
  await expect(resultHeading(page)).toContainText(`${scoreGad7(answers)} out of 21`);

  await page.reload();
  await expect(resultHeading(page)).toContainText(`${scoreGad7(answers)} out of 21`);

  await page.goto('/');
  await expect(page.getByRole('link', { name: /Your check-in result is still here/ })).toBeVisible();

  // A new tab in the same browser session: sessionStorage belongs to the tab that closed.
  await page.close();
  const next = await context.newPage();
  await next.goto('/');
  await expectGuestHome(next);
  await expect(next.getByText('Your check-in result is still here')).toBeHidden();
  await next.goto('/result');
  await expect(next).toHaveURL(/\/check-in$/);
  expect(await next.evaluate(() => sessionStorage.length)).toBe(0);
});

test('a guest can resume a check-in after a refresh', async ({ page }) => {
  await page.goto('/check-in/gad7');
  await page.getByRole('button', { name: 'Begin' }).click();
  await answerItems(page, [1, 2]);
  await expect(page).toHaveURL(/\/check-in\/3$/);
  await page.reload();
  await expect(page).toHaveURL(/\/check-in\/3$/);
  await page.goto('/');
  await page.getByRole('link', { name: /Continue your check-in/ }).click();
  await expect(page).toHaveURL(/\/check-in\/3$/);
});
