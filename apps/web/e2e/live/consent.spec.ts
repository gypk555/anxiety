import { readFile } from 'node:fs/promises';
import { CONSENT_CHANGES } from '@anxiocare/shared';
import { acceptConsent, api, CODE_LABEL, enterCode, expect, expectAccountHome, expectGuestHome, makeConsentStale, requestCode, rowCount, seedAssessment, seedJournal, signUp, test, uniqueEmail, waitForCode } from './support';

const REPROMPT = "We've updated our privacy notice";
const FIRST_TIME = 'Before we save anything';

/** An account with saved data whose accepted notice has just gone out of date. */
async function staleAccount(page: Parameters<typeof signUp>[0], context: Parameters<typeof api>[0]) {
  const email = await signUp(page, 'stale');
  const saved = await seedAssessment(context, [1, 1, 1, 1, 1, 1, 1], 1);
  const entry = await seedJournal(context, { thought: 'A thought to keep' });
  const id = await api(context).userId();
  await makeConsentStale(id);
  return { email, id, saved, entry };
}

test('re-prompt: Home routes to the prompt, which says what changed and that the data is kept', async ({ page, context }) => {
  await staleAccount(page, context);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: REPROMPT })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/consent');
  await expect(page.getByRole('heading', { name: 'What changed' })).toBeVisible();
  for (const line of CONSENT_CHANGES.summary) await expect(page.getByText(line)).toBeVisible();
  await expect(page.getByText(/Everything you've saved is still here/)).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('24 hours');
  await expect(page.getByRole('main')).not.toContainText('nothing is kept');
  await expect(page.getByRole('link', { name: /Get help/ })).toBeVisible();
});

test('re-prompt: every guarded route waits on the prompt, and accepting returns there with the data intact', async ({ page, context }) => {
  const { saved, entry } = await staleAccount(page, context);
  for (const path of ['/trends', '/journal', `/result/${saved.id}`]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: REPROMPT })).toBeVisible();
  }
  await page.goto('/journal');
  await page.getByRole('checkbox', { name: 'I am 18 or older.' }).check();
  await page.getByRole('checkbox', { name: /I agree to AnxioCare storing/ }).check();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(page.getByRole('link', { name: /A thought to keep/ })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/journal');
  expect((await api(context).items('/assessments')).map((a) => a.id)).toEqual([saved.id]);
  expect((await api(context).items('/journal')).map((j) => j.id)).toEqual([entry.id]);
});

test('re-prompt: download works from the prompt without accepting, and holds everything', async ({ page, context }) => {
  const { email, saved, entry } = await staleAccount(page, context);
  await page.goto('/');
  await page.getByRole('link', { name: 'Download or delete my data' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your agreement is needed' })).toBeVisible();
  await expect(page.getByText(/Your data is kept/)).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const data = JSON.parse(await readFile(await (await download).path(), 'utf8')) as { account: { email: string }; assessments: { id: string }[]; journal: { id: string }[] };
  expect(data.account.email).toBe(email);
  expect(data.assessments.map((a) => a.id)).toEqual([saved.id]);
  expect(data.journal.map((j) => j.id)).toEqual([entry.id]);
});

test('re-prompt: sign out works without accepting, from the prompt and from Settings', async ({ page, context }) => {
  const { email } = await staleAccount(page, context);
  await page.goto('/settings');
  await page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expectGuestHome(page);
  expect((await api(context).get('/me')).status()).toBe(401);

  // Signing back in lands on the prompt again, and "Not now" signs out from there.
  await enterCode(page, await requestCode(page, email));
  await expect(page.getByRole('heading', { level: 1, name: REPROMPT })).toBeVisible();
  await page.getByRole('button', { name: 'Not now, sign me out' }).click();
  await expectGuestHome(page);
  expect((await api(context).get('/me')).status()).toBe(401);
});

test('re-prompt: deleting the account works without accepting', async ({ page, context }) => {
  const { email, id } = await staleAccount(page, context);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
  await sheet.getByRole('button', { name: 'Email me a code' }).click();
  const code = await waitForCode(email, 'account_delete');
  await sheet.getByLabel(CODE_LABEL).fill(code);
  await sheet.getByRole('button', { name: 'Delete everything now' }).click();
  await expect(page.getByText('Your account and all your data have been deleted.')).toBeVisible();
  expect(await rowCount('users', { column: 'id', id })).toBe(0);
  expect(await rowCount('assessments', { column: 'user_id', id })).toBe(0);
  expect(await rowCount('journal_entries', { column: 'user_id', id })).toBe(0);
});

test('re-prompt: the tools and Get help stay open without accepting', async ({ page, context }) => {
  await staleAccount(page, context);
  await page.goto('/');
  await page.getByRole('link', { name: 'Use the tools without agreeing' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Something to do, right now' })).toBeVisible();
  await page.getByRole('link', { name: /Get help/ }).click();
  await expect(page.getByRole('link', { name: 'Call 112' })).toBeVisible();
});

test('never consented: the screen says it goes after 24 hours, and sign out, download and delete are open', async ({ page, context }) => {
  const email = uniqueEmail('never');
  await enterCode(page, await requestCode(page, email));
  await expect(page.getByRole('heading', { level: 1, name: FIRST_TIME })).toBeVisible();
  await expect(page.getByText(/this new account.*is deleted after 24 hours/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What changed' })).toHaveCount(0);

  // Home does not hide the question.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: FIRST_TIME })).toBeVisible();

  await page.getByRole('link', { name: 'Download or delete my data' }).click();
  await expect(page.getByText(/deleted after 24 hours/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const data = JSON.parse(await readFile(await (await download).path(), 'utf8')) as { account: { email: string } };
  expect(data.account.email).toBe(email);

  await page.getByRole('button', { name: 'Delete my account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
  await sheet.getByRole('button', { name: 'Email me a code' }).click();
  await waitForCode(email, 'account_delete');
  await sheet.getByRole('button', { name: 'Keep my account' }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expectGuestHome(page);
  expect((await api(context).get('/me')).status()).toBe(401);
});

test('never consented: deleting straight away works without accepting', async ({ page, context }) => {
  const email = uniqueEmail('neverdelete');
  await enterCode(page, await requestCode(page, email));
  await expect(page.getByRole('heading', { level: 1, name: FIRST_TIME })).toBeVisible();
  const id = await api(context).userId();
  await page.getByRole('link', { name: 'Download or delete my data' }).click();
  await page.getByRole('button', { name: 'Delete my account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
  await sheet.getByRole('button', { name: 'Email me a code' }).click();
  await sheet.getByLabel(CODE_LABEL).fill(await waitForCode(email, 'account_delete'));
  await sheet.getByRole('button', { name: 'Delete everything now' }).click();
  await expect(page.getByText('Your account and all your data have been deleted.')).toBeVisible();
  expect(await rowCount('users', { column: 'id', id })).toBe(0);
});

test('never consented: agreeing from Settings goes back to Settings, as a normal account', async ({ page }) => {
  await enterCode(page, await requestCode(page, uniqueEmail('late')));
  await expect(page.getByRole('heading', { level: 1, name: FIRST_TIME })).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Review and agree' }).click();
  await acceptConsent(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('Optional. Only used to greet you.')).toBeVisible();
  await page.goto('/');
  await expectAccountHome(page);
});
