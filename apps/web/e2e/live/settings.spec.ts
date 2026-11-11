import { readFile } from 'node:fs/promises';
import { CODE_LABEL, lastMail, acceptConsent, api, differentCode, enterCode, expect, expectAccountHome, expectGuestHome, mailCount, requestCode, seedAssessment, seedJournal, signIn, signOut, signUp, test, uniqueEmail, waitForCode, type SavedAssessment } from './support';

test('rename: greeted by the new name, kept after a reload, and it can be removed', async ({ page, context }) => {
  await signUp(page, 'rename');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Name', exact: true }).click();
  await page.getByRole('dialog', { name: 'Your name' }).getByLabel('Optional. Only used to greet you.').fill('Asha');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Name saved')).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(', Asha.');

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Name', exact: true })).toHaveAccessibleDescription('Asha Only used to greet you');
  await page.getByRole('button', { name: 'Name', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your name' }).getByLabel('Optional. Only used to greet you.')).toHaveValue('Asha');
  expect((await (await api(context).get('/me')).json()) as object).toMatchObject({ displayName: 'Asha' });

  await page.getByRole('dialog', { name: 'Your name' }).getByLabel('Optional. Only used to greet you.').fill('');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Name saved')).toBeVisible();
  expect((await (await api(context).get('/me')).json()) as object).toMatchObject({ displayName: null });
});

test('email change needs a code from each inbox; the account and its data move with it', async ({ page, context, newContext, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/me\/email\/verify$/, 400);
  const oldEmail = await signUp(page, 'oldmail');
  const saved = await seedAssessment(context, [1, 1, 1, 1, 1, 1, 1], 1);
  const newEmail = uniqueEmail('newmail');

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Email', exact: true })).toHaveAccessibleDescription(oldEmail);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Change your email' });
  await expect(sheet.getByText("We'll email one code to your current address and one to the new address. You'll need both.")).toBeVisible();
  await sheet.getByLabel('New email address').fill(newEmail);
  await sheet.getByRole('button', { name: 'Send codes' }).click();

  // Each box says which inbox to look in, by name.
  const currentBox = sheet.getByLabel('Code sent to your current address');
  const newBox = sheet.getByLabel('Code sent to your new address');
  await expect(currentBox).toBeVisible();
  await expect(newBox).toBeVisible();
  await expect(sheet.getByText(oldEmail)).toBeVisible();
  await expect(sheet.getByText(newEmail)).toBeVisible();
  await expect(sheet.getByText(/spam folder/)).toBeVisible();
  await expect(sheet.getByText(/in a few minutes, try again later/)).toBeVisible();
  const confirm = sheet.getByRole('button', { name: 'Confirm new email' });
  await expect(confirm).toBeDisabled();

  const code = await waitForCode(newEmail, 'email_change');
  const currentCode = await waitForCode(oldEmail, 'email_change_current');
  expect(lastMail(oldEmail, 'email_change_current')!.text).toMatch(/current address/);
  expect(lastMail(newEmail, 'email_change')!.text).toMatch(/new address/);

  // One good code is not enough, and the answer does not say which one was wrong.
  await currentBox.fill(differentCode(currentCode));
  await newBox.fill(code);
  await confirm.click();
  await expect(sheet.getByRole('alert')).toContainText("Those codes didn't work");
  await expect(page.getByRole('main').getByText(oldEmail).first()).toBeVisible();
  await expect(currentBox).toHaveValue('');
  await expect(newBox).toHaveValue('');

  await currentBox.fill(currentCode);
  await newBox.fill(code);
  await confirm.click();
  await expect(page.getByText('Email updated. Use it next time you sign in.')).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: 'Email', exact: true })).toHaveAccessibleDescription(newEmail);
  await expect.poll(() => mailCount(oldEmail, 'email_changed_notice')).toBe(1);

  await signOut(page);
  await signIn(page, newEmail); // No consent: the same account.
  const items = await api(context).items<SavedAssessment>('/assessments');
  expect(items.map((a) => a.id)).toEqual([saved.id]);

  // The old address is now a stranger: a new account, with none of the data.
  const other = await newContext();
  const otherPage = await other.newPage();
  await enterCode(otherPage, await requestCode(otherPage, oldEmail));
  await acceptConsent(otherPage);
  await expectAccountHome(otherPage);
  expect(await api(other).items('/assessments')).toEqual([]);
});

test('sessions: a second device is listed, and revoking it signs that device out', async ({ page, newContext, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/assessments$/, 401);
  // Trends also asks for the mood log, so the revoked device hears 401 there too.
  guard.expectHttpError(/^\/api\/v1\/moods$/, 401);
  // And for reflections.
  guard.expectHttpError(/^\/api\/v1\/reflections$/, 401);
  const email = await signUp(page, 'sessions');

  const second = await newContext();
  const secondPage = await second.newPage();
  await signIn(secondPage, email);
  await secondPage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tools' }).click();

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Signed-in devices' })).toHaveAccessibleDescription('This device and 1 other');
  await page.getByRole('button', { name: 'Signed-in devices' }).click();
  const devices = page.getByRole('dialog', { name: 'Signed-in devices' }).getByRole('listitem');
  await expect(devices).toHaveCount(2);
  const sheetOf = page.getByRole('dialog', { name: 'Signed-in devices' });
  await expect(sheetOf.getByText('This device', { exact: true })).toHaveCount(1);
  await expect(sheetOf.getByText(/^Last used /)).toHaveCount(1);

  const revoke = page.getByRole('button', { name: /^Sign out .+ on / });
  await expect(revoke).toHaveCount(1);
  await revoke.click();
  const sheet = page.getByRole('dialog', { name: 'Sign out this device?' });
  await sheet.getByRole('button', { name: 'Keep signed in' }).click();
  await expect(devices).toHaveCount(2);
  await revoke.click();
  await sheet.getByRole('button', { name: 'Sign out device' }).click();
  await expect(devices).toHaveCount(1);

  // Still believes it is signed in, until its next request. Then it is told, and asked to sign in.
  await secondPage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Trends' }).click();
  await expect(secondPage).toHaveURL(/\/sign-in\?next=%2Ftrends$/);
  await expect(secondPage.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  expect((await api(second).get('/me')).status()).toBe(401);

  // The device that did the revoking is unaffected.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Signed-in devices' })).toHaveAccessibleDescription('Only this device');
});

test('sign out on all devices ends every session, keeps the data', async ({ page, context, newContext }) => {
  const email = await signUp(page, 'logoutall');
  await seedJournal(context);
  const second = await newContext();
  const secondPage = await second.newPage();
  await signIn(secondPage, email);

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out on all devices' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out everywhere' }).click();
  await expectGuestHome(page);

  expect((await api(context).get('/me')).status()).toBe(401);
  expect((await api(second).get('/me')).status()).toBe(401);
  await secondPage.goto('/journal');
  await expect(secondPage).toHaveURL(/\/sign-in\?next=%2Fjournal$/);
  await expect(secondPage.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();

  await signIn(secondPage, email);
  expect(await api(second).items('/journal')).toHaveLength(1);
});

test('the download contains the data', async ({ page, context }) => {
  const email = await signUp(page, 'export');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Name', exact: true }).click();
  await page.getByRole('dialog', { name: 'Your name' }).getByLabel('Optional. Only used to greet you.').fill('Asha');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Name saved')).toBeVisible();
  const assessment = await seedAssessment(context, [2, 2, 2, 1, 1, 1, 1], 2);
  const entry = await seedJournal(context, { thought: 'A thought to be exported' });

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^account-data-\d{4}-\d{2}-\d{2}\.json$/);
  expect(download.suggestedFilename()).not.toMatch(/anxi|care|health/i);
  await expect(page.getByRole('button', { name: 'Download my data' })).toHaveAccessibleDescription('Download started.');

  const data = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    account: { email: string; displayName: string };
    consents: { version: string; adultConfirmed: boolean; healthDataConsent: boolean }[];
    assessments: SavedAssessment[];
    journal: { id: string; thought: string }[];
    sessions: { deviceLabel: string }[];
  };
  expect(data.account).toMatchObject({ email, displayName: 'Asha' });
  expect(data.consents).toHaveLength(1);
  expect(data.consents[0]).toMatchObject({ adultConfirmed: true, healthDataConsent: true });
  expect(data.assessments).toEqual([assessment]);
  expect(data.journal.map((j) => j.id)).toEqual([entry.id]);
  expect(data.journal[0]!.thought).toBe('A thought to be exported');
  expect(data.sessions).toHaveLength(1);
});

test('deleting the account needs a code, signs out, and signing in again is a fresh account', async ({ page, context, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/me\/delete\/confirm$/, 400);
  const email = await signUp(page, 'delete');
  const oldId = await api(context).userId();
  await seedAssessment(context, [1, 1, 1, 1, 1, 1, 1], 1);
  await seedJournal(context);

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(sheet.getByText(/Encrypted backups age out within 7 days/)).toBeVisible();
  await expect(sheet).not.toContainText(/recover/i);
  await sheet.getByRole('button', { name: 'Email me a code' }).click();
  const code = await waitForCode(email, 'account_delete');
  await expect(sheet.getByText(/spam folder/)).toBeVisible();

  await sheet.getByLabel(CODE_LABEL).fill(differentCode(code));
  await sheet.getByRole('button', { name: 'Delete everything now' }).click();
  await expect(sheet.getByRole('alert')).toContainText("That code didn't work");
  expect((await api(context).get('/me')).status()).toBe(200);

  await sheet.getByLabel(CODE_LABEL).fill(code);
  await sheet.getByRole('button', { name: 'Delete everything now' }).click();
  await expect(page.getByText('Your account and all your data have been deleted.')).toBeVisible();
  await expect(page.getByRole('heading', { name: "You're not signed in" })).toBeVisible();
  expect(await context.cookies()).toEqual([]);
  expect((await api(context).get('/me')).status()).toBe(401);

  await enterCode(page, await requestCode(page, email));
  await acceptConsent(page);
  await expectAccountHome(page);
  expect(await api(context).userId()).not.toBe(oldId);
  expect(await api(context).items('/assessments')).toEqual([]);
  expect(await api(context).items('/journal')).toEqual([]);
  await expect(page.getByText('Your first check-in')).toBeVisible();
});
