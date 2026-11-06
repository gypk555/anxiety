import { api, expect, expectAccountHome, seedJournal, signUp, test } from './support';
import type { Page } from '@playwright/test';

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true });

test('a thought record through all five steps is stored whole, and survives a reload', async ({ page, context }) => {
  await signUp(page, 'journal');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
  await page.getByRole('link', { name: 'Write a thought record' }).click();

  // Required steps say so.
  await next(page).click();
  await expect(page.getByRole('alert')).toContainText('Write a few words');
  await page.getByLabel('What happened?').fill('My manager asked to talk tomorrow.');
  await next(page).click();
  await next(page).click();
  await expect(page.getByRole('alert')).toContainText('Write the thought');
  await page.getByLabel('What went through your mind?').fill("I'm going to lose my job.");
  await next(page).click();

  await page.getByRole('button', { name: 'Anxious' }).click();
  await page.getByRole('button', { name: 'Scared' }).click();
  await page.getByPlaceholder('Add your own').fill('Hollow');
  await page.getByRole('button', { name: 'Add feeling' }).click();
  await expect(page.getByRole('button', { name: 'Hollow' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('slider').fill('8');
  await next(page).click();

  await page.getByLabel('What supports it?').fill('I missed one deadline.');
  await page.getByLabel("What doesn't fit?").fill('She praised my last two reports.');
  await next(page).click();

  await page.getByLabel('Is there a more balanced way to see it?').fill("I don't know what it's about yet.");
  await page.getByRole('button', { name: 'Rate how it feels now' }).click();
  await page.getByRole('slider').fill('5');
  await page.getByRole('button', { name: 'Save thought record' }).click();
  await expect(page).toHaveURL(/\/journal\/[0-9a-f-]{36}$/);

  const check = async () => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("I'm going to lose my job.");
    await expect(page.getByText('My manager asked to talk tomorrow.')).toBeVisible();
    await expect(page.getByText('Anxious, Scared, Hollow. Strength 8 out of 10.')).toBeVisible();
    await expect(page.getByText('I missed one deadline.')).toBeVisible();
    await expect(page.getByText('She praised my last two reports.')).toBeVisible();
    await expect(page.getByText("I don't know what it's about yet.")).toBeVisible();
    await expect(page.getByText('Strength 5 out of 10.')).toBeVisible();
  };
  await check();
  await page.reload();
  await check();

  const [entry] = await api(context).items('/journal');
  expect(entry).toMatchObject({
    situation: 'My manager asked to talk tomorrow.',
    thought: "I'm going to lose my job.",
    feelings: ['Anxious', 'Scared', 'Hollow'],
    intensityBefore: 8,
    evidenceFor: 'I missed one deadline.',
    evidenceAgainst: 'She praised my last two reports.',
    balancedThought: "I don't know what it's about yet.",
    intensityAfter: 5,
  });

  await page.goto('/journal');
  await expect(page.getByRole('link', { name: /lose my job/ })).toBeVisible();
});

test('editing changes the record, and shows the new text straight away and after a reload', async ({ page, context }) => {
  await signUp(page, 'edit');
  const entry = await seedJournal(context);
  await page.goto(`/journal/${entry.id}`);
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('What happened?')).toHaveValue(entry.situation);
  await page.getByLabel('What happened?').fill('The train was cancelled.');
  await next(page).click();
  await expect(page.getByLabel('What went through your mind?')).toHaveValue(entry.thought);
  await next(page).click();
  await expect(page.getByRole('button', { name: 'Worried' })).toHaveAttribute('aria-pressed', 'true');
  await next(page).click();
  await next(page).click();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/journal/${entry.id}$`));
  await expect(page.getByText('The train was cancelled.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('The train was cancelled.')).toBeVisible();
  await expect(page.getByText(entry.situation)).toBeHidden();

  const [saved] = await api(context).items<{ situation: string; createdAt: string; updatedAt: string }>('/journal');
  expect(saved!.situation).toBe('The train was cancelled.');
  expect(new Date(saved!.updatedAt).getTime()).toBeGreaterThan(new Date(saved!.createdAt).getTime());

});

test('leaving a new record warns first; keep writing keeps it, discard drops it', async ({ page, context }) => {
  await signUp(page, 'discard');
  await page.goto('/journal/new');

  // Nothing typed: no warning.
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/journal$/);

  await page.getByRole('link', { name: 'Write a thought record' }).click();
  await page.getByLabel('What happened?').fill('A draft I may not keep');
  await page.getByRole('main').getByRole('button', { name: 'Close' }).click();
  const sheet = page.getByRole('dialog', { name: 'Discard this thought record?' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Keep writing' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByLabel('What happened?')).toHaveValue('A draft I may not keep');

  await page.getByRole('main').getByRole('button', { name: 'Close' }).first().click();
  await sheet.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByRole('link', { name: 'Write a thought record' })).toBeVisible();
  expect(await api(context).items('/journal')).toHaveLength(0);
});

test('leaving an edit warns first, and discarding keeps the saved version', async ({ page, context }) => {
  await signUp(page, 'discardedit');
  const entry = await seedJournal(context);
  await page.goto(`/journal/${entry.id}/edit`);
  await page.getByLabel('What happened?').fill('Changed my mind');
  await page.getByRole('main').getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('dialog', { name: 'Discard your changes?' }).getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(new RegExp(`/journal/${entry.id}$`));
  await expect(page.getByText(entry.situation)).toBeVisible();
  const [saved] = await api(context).items<{ situation: string }>('/journal');
  expect(saved!.situation).toBe(entry.situation);
});

test('a draft waits while you go elsewhere, and Home points back to it', async ({ page }) => {
  await signUp(page, 'draft');
  await page.getByRole('link', { name: 'Write' }).click();
  await page.getByLabel('What happened?').fill('Still thinking about it');
  await page.getByRole('link', { name: 'AnxioCare, home' }).click();
  await expectAccountHome(page);
  await page.getByRole('link', { name: /Continue your thought record/ }).click();
  await expect(page.getByLabel('What happened?')).toHaveValue('Still thinking about it');
});

test('deleting a record removes it after a confirmation', async ({ page, context, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/journal\//, 404);
  await signUp(page, 'deljournal');
  const entry = await seedJournal(context);
  await page.goto(`/journal/${entry.id}`);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete this thought record?' });
  await sheet.getByRole('button', { name: 'Keep record' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.thought);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await sheet.getByRole('button', { name: 'Delete record' }).click();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
  expect((await api(context).get(`/journal/${entry.id}`)).status()).toBe(404);
  await page.goto(`/journal/${entry.id}`);
  await expect(page.getByRole('heading', { level: 1, name: "There's nothing at this address" })).toBeVisible();
});
