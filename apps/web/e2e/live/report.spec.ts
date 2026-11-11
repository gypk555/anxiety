import { expect, localDay, seedAssessment, seedJournal, seedMood, seedPlan, signUp, test } from './support';

test('a report for a doctor: sections on and off change what it holds, and it prints on its own stylesheet', async ({ page, context }) => {
  await signUp(page, 'report');
  await seedAssessment(context, [2, 2, 1, 2, 1, 1, 1], 1);
  await seedMood(context, localDay(1), 2, 'MarkerMoodNote');
  await seedMood(context, localDay(2), 4);
  await seedJournal(context, { situation: 'MarkerSituation' });
  await seedPlan(context, { reasonsToLive: ['MarkerReason'] });

  await page.goto('/trends');
  await page.getByRole('link', { name: 'Make a report for your doctor' }).click();
  await expect(page).toHaveURL(/\/report$/);
  const preview = page.getByRole('region', { name: 'Report preview' });
  await expect(preview.getByRole('table', { name: 'GAD-7 check-ins' })).toContainText('10 of 21');
  await expect(preview.getByRole('table', { name: 'Daily mood, weekly averages' })).toBeVisible();
  await expect(preview.getByRole('img', { name: /scores over time/ })).toBeVisible();
  for (const hidden of ['MarkerMoodNote', 'MarkerSituation', 'MarkerReason']) await expect(preview).not.toContainText(hidden);
  await expect(preview).toContainText('Self-reported. A screening, not a diagnosis.');

  for (const name of ['Mood notes', 'Safety plan', 'Journal entries']) await page.getByRole('checkbox', { name }).check();
  for (const shown of ['MarkerMoodNote', 'MarkerSituation', 'MarkerReason']) await expect(preview).toContainText(shown);
  await page.getByRole('checkbox', { name: 'GAD-7 scores' }).uncheck();
  await page.getByRole('checkbox', { name: 'A chart of the scores' }).uncheck();
  await expect(preview.getByRole('table', { name: 'GAD-7 check-ins' })).toHaveCount(0);
  await expect(preview.getByRole('img', { name: /scores over time/ })).toHaveCount(0);

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Save as PDF or print' })).toBeHidden();
  await expect(page.getByRole('banner')).toBeHidden();
  const breaks = await page.locator('.report-section').evaluateAll((els) => els.map((e) => getComputedStyle(e).breakBefore));
  expect(breaks[0]).toBe('auto');
  expect(breaks.slice(1).every((b) => b === 'page')).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
});
