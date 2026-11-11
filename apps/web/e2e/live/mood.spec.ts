import { api, expect, localDay, seedAssessment, seedMood, signUp, test } from './support';

test('logs today from Home, updates the same day, and shows it as its own chart and table on Trends', async ({ page, context }) => {
  await signUp(page, 'mood');
  const card = page.getByRole('group', { name: 'How are you today?' });
  await card.getByRole('button', { name: 'Low', exact: true }).click();
  await page.getByLabel('A note, if you like').fill('Long day at work.');
  await page.getByRole('button', { name: 'Save for today' }).click();
  await expect(page.getByText('Today you said')).toBeVisible();

  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('group', { name: 'How are you today?' }).getByRole('button', { name: 'Good', exact: true }).click();
  await page.getByRole('button', { name: 'Save for today' }).click();
  await expect(page.getByText('Today you said')).toContainText('Good');

  const today = localDay(0);
  const items = (await (await api(context).get(`/moods?from=${today}&to=${today}`)).json()).items;
  expect(items).toEqual([expect.objectContaining({ day: today, rating: 4, note: 'Long day at work.' })]);

  await seedMood(context, localDay(2), 1, 'Hard one.');
  await seedAssessment(context, [1, 1, 1, 1, 1, 1, 1], 1);
  await page.goto('/trends');
  const mood = page.getByRole('region', { name: 'Your daily mood log, not a test score' });
  await expect(mood.getByRole('img')).toHaveAccessibleName(/Your daily mood, rated from Very low to Very good/);
  await expect(page.getByRole('img', { name: /scores over time/ })).toBeVisible();
  await mood.getByRole('button', { name: 'Show the mood log as a table' }).click();
  const rows = mood.getByRole('table', { name: 'Daily mood by date' }).getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('Good');
  await expect(rows.nth(2)).toContainText('Very low');
  await expect(rows.nth(2)).toContainText('Hard one.');
});

test('past days can be logged, changed and deleted on the mood log, never a future day', async ({ page, context }) => {
  await signUp(page, 'mood-past');
  await seedMood(context, localDay(5), 3);
  await page.goto('/mood');
  await page.getByRole('button', { name: /^Change/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Very good' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('list', { name: 'Days you logged' })).toContainText('Very good');

  await page.getByRole('button', { name: 'Log another day' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByLabel('Which day')).toHaveAttribute('max', localDay(0));
  await sheet.getByLabel('Which day').fill(localDay(9));
  await sheet.getByRole('button', { name: 'Low', exact: true }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('list', { name: 'Days you logged' }).getByRole('listitem')).toHaveCount(2);

  await page.getByRole('button', { name: /^Change/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete this day' }).click();
  await page.getByRole('button', { name: 'Yes, delete it' }).click();
  await expect(page.getByRole('list', { name: 'Days you logged' }).getByRole('listitem')).toHaveCount(1);
  expect((await (await api(context).get(`/moods?from=${localDay(30)}&to=${localDay(0)}`)).json()).items).toHaveLength(1);
});
