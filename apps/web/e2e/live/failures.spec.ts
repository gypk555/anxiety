import { acceptConsent, answerItems, answerDifficulty, api, corruptJournal, expect, injectFault, readGuestResult, resultHeading, seedJournal, serviceWorkerActive, signIn, signInHere, signUp, takeCheckin, test, uniqueEmail, type SavedAssessment } from './support';
import type { BrowserContext, Page } from '@playwright/test';

const SITUATION = 'Typed before the server failed';
const THOUGHT = 'This must not get lost';
const AGAINST = 'It has not been lost so far';
const BALANCED = 'I can try again';

async function writeRecordToLastStep(page: Page) {
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await page.goto('/journal/new');
  await page.getByLabel('What happened?').fill(SITUATION);
  await next.click();
  await page.getByLabel('What went through your mind?').fill(THOUGHT);
  await next.click();
  await page.getByRole('button', { name: 'Worried' }).click();
  await next.click();
  await page.getByLabel("What doesn't fit?").fill(AGAINST);
  await next.click();
  await page.getByLabel('Is there a more balanced way to see it?').fill(BALANCED);
}

async function expectEverythingStillTyped(page: Page) {
  await expect(page.getByLabel('Is there a more balanced way to see it?')).toHaveValue(BALANCED);
  const previous = page.getByRole('button', { name: 'Previous step' });
  await previous.click();
  await expect(page.getByLabel("What doesn't fit?")).toHaveValue(AGAINST);
  await previous.click();
  await expect(page.getByRole('button', { name: 'Worried' })).toHaveAttribute('aria-pressed', 'true');
  await previous.click();
  await expect(page.getByLabel('What went through your mind?')).toHaveValue(THOUGHT);
  await previous.click();
  await expect(page.getByLabel('What happened?')).toHaveValue(SITUATION);
  const next = page.getByRole('button', { name: 'Next', exact: true });
  for (let i = 0; i < 4; i += 1) await next.click();
}

test('a server error while saving a record says so, loses nothing, and saving again works once', async ({ page, context, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/journal$/, 500);
  await signUp(page, 'journal500');
  const clear = await injectFault(await api(context).userId(), 'journal_entries', 'fail');
  try {
    await writeRecordToLastStep(page);
    await page.getByRole('button', { name: 'Save thought record' }).click();
    await expect(page.getByRole('alert')).toContainText('Something went wrong on our side');
    await expect(page.getByRole('alert')).toContainText('Your draft is safe here.');
    await expect(page).toHaveURL(/\/journal\/new/);
    await expectEverythingStillTyped(page);
    expect(await api(context).items('/journal')).toHaveLength(0);
  } finally {
    await clear();
  }
  await page.getByRole('button', { name: 'Save thought record' }).click();
  await expect(page).toHaveURL(/\/journal\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(THOUGHT);
  expect(await api(context).items('/journal')).toHaveLength(1);
});

test('a server error while saving an edit keeps the edit', async ({ page, context, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/journal\//, 500);
  await signUp(page, 'edit500');
  const entry = await seedJournal(context);
  const next = page.getByRole('button', { name: 'Next', exact: true });
  const clear = await injectFault(await api(context).userId(), 'journal_entries', 'fail');
  try {
    await page.goto(`/journal/${entry.id}/edit`);
    await page.getByLabel('What happened?').fill('An edit worth keeping');
    for (let i = 0; i < 4; i += 1) await next.click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert')).toContainText('Your draft is safe here.');
    for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Previous step' }).click();
    await expect(page.getByLabel('What happened?')).toHaveValue('An edit worth keeping');
    for (let i = 0; i < 4; i += 1) await next.click();
  } finally {
    await clear();
  }
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(new RegExp(`/journal/${entry.id}$`));
  await expect(page.getByText('An edit worth keeping')).toBeVisible();
});

test('a server error on a signed-in check-in keeps the result, and it can be saved afterwards', async ({ page, context, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/assessments$/, 500);
  await signUp(page, 'check500');
  const clear = await injectFault(await api(context).userId(), 'assessments', 'fail');
  try {
    await takeCheckin(page, [2, 2, 2, 2, 2, 2, 2], 2);
    await expect(page).toHaveURL(/\/result$/);
    await expect(resultHeading(page)).toContainText('14 out of 21');
    await expect(page.getByRole('alert')).toContainText("couldn't save");

    await page.getByRole('button', { name: 'Save result' }).click();
    await expect(page.getByRole('alert')).toContainText('Something went wrong on our side');
    await expect(resultHeading(page)).toContainText('14 out of 21');
    expect((await readGuestResult(page))?.answers).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(await api(context).items('/assessments')).toHaveLength(0);
  } finally {
    await clear();
  }
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/);
  expect(await api(context).items('/assessments')).toHaveLength(1);
});

test('offline while saving a record: says so, loses nothing, and works when back online', async ({ page, context, guard }) => {
  guard.expectOfflineErrors();
  await signUp(page, 'offlinesave');
  await serviceWorkerActive(page);
  await writeRecordToLastStep(page);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save thought record' }).click();
  await expect(page.getByRole('alert')).toContainText("We couldn't reach AnxioCare. Check your connection and try again.");
  await expect(page.getByRole('alert')).toContainText('Your draft is safe here.');
  await expectEverythingStillTyped(page);

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Save thought record' }).click();
  await expect(page).toHaveURL(/\/journal\/[0-9a-f-]{36}$/);
  expect(await api(context).items('/journal')).toHaveLength(1);
});

test('offline at the end of a signed-in check-in: the result stays, and saves once when back online', async ({ page, context, guard }) => {
  guard.expectOfflineErrors();
  await signUp(page, 'offlinecheck');
  await serviceWorkerActive(page);
  const answers = [1, 2, 1, 2, 1, 2, 1];
  await page.goto('/check-in/gad7');
  await page.getByRole('button', { name: 'Begin' }).click();
  await answerItems(page, answers);

  await context.setOffline(true);
  await answerDifficulty(page, 1);
  await expect(page).toHaveURL(/\/result$/);
  await expect(resultHeading(page)).toContainText('10 out of 21');
  await expect(page.getByRole('alert')).toContainText("couldn't save");

  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page.getByRole('alert')).toContainText("We couldn't reach AnxioCare");
  const guest = await readGuestResult(page);
  expect(guest?.answers).toEqual(answers);

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/);
  const items = await api(context).items<SavedAssessment>('/assessments');
  expect(items).toHaveLength(1);
  expect(items[0]!.takenAt).toBe(guest!.takenAt);
});

test('a slow save shows it is working, cannot be sent twice, and lands once', async ({ page, context }) => {
  await signUp(page, 'slow');
  const clear = await injectFault(await api(context).userId(), 'journal_entries', 'slow');
  try {
    await writeRecordToLastStep(page);
    await page.getByRole('button', { name: 'Save thought record' }).click();
    const saving = page.getByRole('button', { name: 'Saving' });
    await expect(saving).toBeDisabled();
    await expect(page).toHaveURL(/\/journal\/[0-9a-f-]{36}$/);
    expect(await api(context).items('/journal')).toHaveLength(1);
  } finally {
    await clear();
  }
});

test('a slow signed-in check-in tells you it is saving', async ({ page, context }) => {
  await signUp(page, 'slowcheck');
  const clear = await injectFault(await api(context).userId(), 'assessments', 'slow');
  try {
    await takeCheckin(page, [1, 1, 1, 1, 1, 1, 1], 1);
    await expect(page.getByText('Saving your result')).toBeVisible();
    await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/);
    expect(await api(context).items('/assessments')).toHaveLength(1);
  } finally {
    await clear();
  }
});

test('a server error loading the journal offers a way out, and trying again recovers', async ({ page, context, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/journal$/, 500);
  await signUp(page, 'load500');
  await seedJournal(context, { thought: 'Comes back after a retry' });
  const repair = await corruptJournal(await api(context).userId());
  try {
    await page.goto('/journal');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Something went wrong on our side');
    await expect(alert.getByRole('link', { name: 'Go to Help' })).toBeVisible();
  } finally {
    await repair();
  }
  await page.getByRole('alert').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('link', { name: /Comes back after a retry/ })).toBeVisible();
});

// ── A session that ends while someone is writing ─────────────────────

/** The session really ends, from another device, while this page still believes it is signed in. */
async function endSessionsFromAnotherDevice(newContext: () => Promise<BrowserContext>, email: string) {
  const second = await newContext();
  const secondPage = await second.newPage();
  await signIn(secondPage, email);
  expect((await api(second).send('POST', '/auth/logout-all')).status()).toBe(204);
}

async function expectNotInStorage(page: Page, text: string) {
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stored).not.toContain(text);
}

test('signed out while saving a record: the text is held in memory only, and comes back for the same person', async ({ page, context, newContext, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/journal$/, 401);
  const email = await signUp(page, 'heldsame');
  await writeRecordToLastStep(page);
  await endSessionsFromAnotherDevice(newContext, email);

  await page.getByRole('button', { name: 'Save thought record' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await expect(page.getByText('You were signed out. Sign in with the same email and what you were working on comes back.')).toBeVisible();
  await expectNotInStorage(page, SITUATION);
  await expectNotInStorage(page, BALANCED);

  await signInHere(page, email);
  await expect(page).toHaveURL(/\/journal\/new/);
  await expectEverythingStillTyped(page);
  await expectNotInStorage(page, SITUATION);
  await page.getByRole('button', { name: 'Save thought record' }).click();
  await expect(page).toHaveURL(/\/journal\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(THOUGHT);
  expect(await api(context).items('/journal')).toHaveLength(1);
});

test('signed out while saving a record: someone else signing in never sees it', async ({ page, newContext, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/journal$/, 401);
  const email = await signUp(page, 'heldother');
  await writeRecordToLastStep(page);
  await endSessionsFromAnotherDevice(newContext, email);
  await page.getByRole('button', { name: 'Save thought record' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=/);

  await signInHere(page, uniqueEmail('stranger'));
  await acceptConsent(page);
  await expect(page).toHaveURL(/\/journal\/new/);
  await expect(page.getByLabel('Is there a more balanced way to see it?')).toHaveValue('');
  await page.getByRole('button', { name: 'Previous step' }).click();
  await page.getByRole('button', { name: 'Previous step' }).click();
  await page.getByRole('button', { name: 'Previous step' }).click();
  await page.getByRole('button', { name: 'Previous step' }).click();
  await expect(page.getByLabel('What happened?')).toHaveValue('');
  await expect(page.locator('body')).not.toContainText(SITUATION);
});

async function resultWaitingToSave(page: Page, context: BrowserContext, email: string, newContext: () => Promise<BrowserContext>) {
  const clear = await injectFault(await api(context).userId(), 'assessments', 'fail');
  try {
    await takeCheckin(page, [3, 3, 2, 2, 2, 2, 2], 2);
    await expect(page).toHaveURL(/\/result$/);
  } finally {
    await clear();
  }
  await endSessionsFromAnotherDevice(newContext, email);
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  expect(await readGuestResult(page)).toBeNull();
}

test('signed out while saving a result: it comes back for the same person, and saves', async ({ page, context, newContext, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/assessments$/, 401);
  guard.expectHttpError(/^\/api\/v1\/assessments$/, 500);
  const email = await signUp(page, 'heldresult');
  await resultWaitingToSave(page, context, email, newContext);
  await signInHere(page, email);
  await expect(page).toHaveURL(/\/result$/);
  await expect(resultHeading(page)).toContainText('16 out of 21');
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/);
  expect(await api(context).items('/assessments')).toHaveLength(1);
});

test('signed out while saving a result: someone else signing in never sees it', async ({ page, context, newContext, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/assessments$/, 401);
  guard.expectHttpError(/^\/api\/v1\/assessments$/, 500);
  const email = await signUp(page, 'heldresult2');
  await resultWaitingToSave(page, context, email, newContext);
  await signInHere(page, uniqueEmail('stranger'));
  await acceptConsent(page);
  await expect(page).toHaveURL(/\/check-in/);
  await expect(page.locator('body')).not.toContainText('16 out of 21');
  expect(await readGuestResult(page)).toBeNull();
});
