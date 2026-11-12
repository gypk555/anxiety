import { randomUUID } from 'node:crypto';
import { scoreGad7, severityFor } from '@anxiocare/shared';
import { api, enterCode, acceptConsent, expect, expectAccountHome, readGuestResult, resultHeading, seedAssessment, signUp, takeCheckin, test, uniqueEmail, waitForCode, type SavedAssessment, giveName } from './support';
import type { Page } from '@playwright/test';

const SEVEN = [2, 1, 2, 1, 2, 1, 1];

/** Takes a guest check-in, then signs up from the result's own "Sign in to save" link. */
async function guestThenSignUp(page: Page, answers = SEVEN, difficulty = 1) {
  await takeCheckin(page, answers, difficulty);
  await expect(page).toHaveURL(/\/result$/);
  const email = uniqueEmail('saver');
  await page.getByRole('link', { name: 'Sign in to save' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code instead' }).click();
  await enterCode(page, await waitForCode(email, 'login'));
  await acceptConsent(page);
  await giveName(page);
  await expect(page).toHaveURL(/\/result$/);
  return email;
}

const dateInPage = (page: Page, iso: string, addDays = 0) =>
  page.evaluate(([value, days]) => {
    const d = new Date(value as string);
    d.setDate(d.getDate() + (days as number));
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  }, [iso, addDays]);

test('a guest result is offered after sign-in, saved once, and a replay adds nothing', async ({ page, context }) => {
  await guestThenSignUp(page);
  const guest = (await readGuestResult(page))!;
  expect(guest.answers).toEqual(SEVEN);

  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/);
  await expect(resultHeading(page)).toContainText(`${scoreGad7(SEVEN)} out of 21`);
  expect(await readGuestResult(page)).toBeNull();

  const http = api(context);
  const items = await http.items<SavedAssessment>('/assessments');
  expect(items).toHaveLength(1);
  const saved = items[0]!;
  expect(saved.answers).toEqual(SEVEN);
  expect(saved.difficulty).toBe(1);
  expect(saved.score).toBe(scoreGad7(SEVEN));
  expect(saved.severity).toBe(severityFor(scoreGad7(SEVEN)).severity);
  expect(saved.takenAt).toBe(guest.takenAt);

  // The same request again, as a retry after a lost response would send it.
  const replay = await http.send('POST', '/assessments', { clientRequestId: guest.clientRequestId, answers: guest.answers, difficulty: guest.difficulty, takenAt: guest.takenAt });
  expect(replay.status()).toBe(200);
  expect(((await replay.json()) as SavedAssessment).id).toBe(saved.id);
  expect(await http.items('/assessments')).toHaveLength(1);

  await page.goto('/');
  await expect(page.getByText('Your check-in result is still here')).toBeHidden();
  await expect(page.getByText(`${severityFor(saved.score).label}, ${saved.score} out of 21`)).toBeVisible();
});

test("takenAt is honoured: an hours-old guest result keeps its own time and date", async ({ page, context }) => {
  await guestThenSignUp(page);
  const takenAt = new Date(Date.now() - 23 * 3_600_000).toISOString();
  await page.evaluate((at) => {
    const raw = JSON.parse(sessionStorage.getItem('anxiocare.result.v1')!) as Record<string, unknown>;
    sessionStorage.setItem('anxiocare.result.v1', JSON.stringify({ ...raw, takenAt: at }));
  }, takenAt);
  await page.reload();
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/);

  const [saved] = await api(context).items<SavedAssessment>('/assessments');
  expect(saved!.takenAt).toBe(takenAt);
  await expect(page.getByText(`Your check-in, ${await dateInPage(page, takenAt)}`)).toBeVisible();
  await expect(page.getByText(`Check in again around ${await dateInPage(page, takenAt, 14)}`)).toBeVisible();
});

test('a result too old to save says why, and nothing is saved', async ({ page, context, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/assessments$/, 400);
  await guestThenSignUp(page);
  const takenAt = new Date(Date.now() - 25 * 3_600_000).toISOString();
  await page.evaluate((at) => {
    const raw = JSON.parse(sessionStorage.getItem('anxiocare.result.v1')!) as Record<string, unknown>;
    sessionStorage.setItem('anxiocare.result.v1', JSON.stringify({ ...raw, takenAt: at }));
  }, takenAt);
  await page.reload();
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page.getByRole('alert')).toContainText('more than a day old');
  expect(await api(context).items('/assessments')).toHaveLength(0);
});

test('the API refuses a future takenAt beyond clock drift, and clamps within it', async ({ page, context }) => {
  await signUp(page, 'future');
  const http = api(context);
  const body = (takenAt: string) => ({ clientRequestId: randomUUID(), answers: SEVEN, difficulty: 1, takenAt });
  const far = await http.send('POST', '/assessments', body(new Date(Date.now() + 10 * 60_000).toISOString()));
  expect(far.status()).toBe(400);
  const near = await http.send('POST', '/assessments', body(new Date(Date.now() + 20_000).toISOString()));
  expect(near.status()).toBe(201);
  expect(new Date(((await near.json()) as SavedAssessment).takenAt).getTime()).toBeLessThanOrEqual(Date.now());
});

test('a signed-in check-in saves straight away, once, with the time it was taken', async ({ page, context }) => {
  await signUp(page, 'direct');
  const before = Date.now();
  await takeCheckin(page, [3, 3, 2, 2, 2, 2, 2], 2);
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/);
  await expect(resultHeading(page)).toContainText('16 out of 21');
  expect(await readGuestResult(page)).toBeNull();

  const items = await api(context).items<SavedAssessment>('/assessments');
  expect(items).toHaveLength(1);
  expect(items[0]!.severity).toBe('severe');
  expect(new Date(items[0]!.takenAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  expect(page.url()).toContain(items[0]!.id);

  await page.reload();
  await expect(resultHeading(page)).toContainText('16 out of 21');
});

test('an all-zero signed-in check-in saves with no difficulty', async ({ page, context }) => {
  await signUp(page, 'zero');
  await takeCheckin(page, [0, 0, 0, 0, 0, 0, 0], null);
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/);
  await expect(resultHeading(page)).toContainText('0 out of 21');
  const [saved] = await api(context).items<SavedAssessment>('/assessments');
  expect(saved!.difficulty).toBeNull();
});

test('trends: list, chart, table, delete; Home shows the next check-in date', async ({ page, context }) => {
  await signUp(page, 'trends');
  const oldest = await seedAssessment(context, [1, 1, 1, 1, 0, 0, 0], 0, new Date(Date.now() - 23 * 3_600_000).toISOString());
  const middle = await seedAssessment(context, [2, 2, 2, 2, 2, 1, 1], 2, new Date(Date.now() - 6 * 3_600_000).toISOString());
  const latest = await seedAssessment(context, [1, 1, 1, 1, 1, 1, 1], 1);

  await page.goto('/trends');
  const history = page.getByRole('region', { name: 'History' }).getByRole('listitem');
  await expect(history).toHaveCount(3);
  await expect(history.nth(0)).toContainText('Mild, 7 out of 21');
  await expect(history.nth(1)).toContainText('Moderate, 12 out of 21');
  await expect(history.nth(2)).toContainText('Minimal, 4 out of 21');
  await expect(history.nth(0)).toContainText(await dateInPage(page, latest.takenAt));

  const chart = page.getByRole('img', { name: /Your check-in scores over time/ });
  await expect(chart).toBeVisible();
  await expect(chart.locator('circle')).toHaveCount(3);
  await expect(chart.locator('path')).toHaveCount(1);
  await expect(page.getByRole('main').locator('figure > p', { hasText: 'Your latest score is 7 out of 21, mild' })).toBeVisible();
  await expect(page.getByRole('main').locator('figure > p', { hasText: 'That is 5 lower than your check-in' })).toBeVisible();

  await page.getByRole('button', { name: 'Show these as a table' }).click();
  const rows = page.getByRole('table', { name: 'Check-in scores by date' }).getByRole('row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText('7');
  await expect(rows.nth(1)).toContainText('Mild');
  await expect(rows.nth(2)).toContainText('Moderate');
  await expect(rows.nth(3)).toContainText('Minimal');

  // Open one from the list.
  await history.nth(1).getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/result/${middle.id}$`));
  await expect(resultHeading(page)).toContainText('12 out of 21');
  await page.goBack();

  // Delete the newest: keep first, then really delete.
  await history.nth(0).getByRole('button', { name: /Delete check-in from/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete this check-in?' });
  await sheet.getByRole('button', { name: 'Keep check-in' }).click();
  await expect(history).toHaveCount(3);
  await history.nth(0).getByRole('button', { name: /Delete check-in from/ }).click();
  await sheet.getByRole('button', { name: 'Delete check-in' }).click();
  await expect(history).toHaveCount(2);
  await expect(page.getByRole('main').locator('figure > p', { hasText: 'Your latest score is 12 out of 21, moderate' })).toBeVisible();
  await expect(chart.locator('circle')).toHaveCount(2);

  const left = await api(context).items<SavedAssessment>('/assessments');
  expect(left.map((a) => a.id)).toEqual([middle.id, oldest.id]);
  await page.reload();
  await expect(history).toHaveCount(2);

  // Home follows the newest that remains, without a reload in between.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
  await expectAccountHome(page);
  await expect(page.getByText('Moderate, 12 out of 21')).toBeVisible();
  await expect(page.getByText(`Last check-in · ${await dateInPage(page, middle.takenAt)}`)).toBeVisible();
  await expect(page.getByText(`Next ${await dateInPage(page, middle.takenAt, 14)}`)).toBeVisible();
});

test('deleting from the result screen leaves trends empty, and the deleted result is not found', async ({ page, context, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/assessments\//, 404);
  await signUp(page, 'delresult');
  const one = await seedAssessment(context, [1, 1, 1, 1, 1, 1, 1], 1);
  await page.goto(`/result/${one.id}`);
  await page.getByRole('button', { name: 'Delete this result' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete result' }).click();
  await expect(page).toHaveURL(/\/trends$/);
  await expect(page.getByText('Nothing to show yet.')).toBeVisible();
  await page.goto(`/result/${one.id}`);
  await expect(page.getByRole('heading', { level: 1, name: "There's nothing at this address" })).toBeVisible();
});


test('a saved result compares with the check-in before it, in words only', async ({ page, context }) => {
  await signUp(page, 'compare');
  const first = await seedAssessment(context, [2, 2, 2, 2, 2, 2, 2], 2, new Date(Date.now() - 6 * 3_600_000).toISOString());
  const second = await seedAssessment(context, [1, 1, 1, 1, 1, 1, 1], 1);

  await page.goto(`/result/${first.id}`);
  await expect(resultHeading(page)).toContainText('14 out of 21');
  await expect(page.getByRole('heading', { name: 'Anxiety seems to be affecting your daily life' })).toBeVisible();
  await expect(page.getByRole('region', { name: /than last time|same as last time/ })).toHaveCount(0);

  await page.goto(`/result/${second.id}`);
  const change = page.getByRole('region', { name: 'Lower than last time' });
  await expect(change).toContainText(`from 14 on ${await dateInPage(page, first.takenAt)} to 7 now`);
  await expect(page.getByRole('heading', { name: "Some anxiety is showing up, and that's common" })).toBeVisible();

  const third = await seedAssessment(context, [2, 2, 2, 2, 2, 1, 1], 2);
  await page.goto(`/result/${third.id}`);
  const higher = page.getByRole('region', { name: 'Higher than last time' });
  await expect(higher).toContainText("isn't a failure");
  await expect(higher).toContainText('now reached the point where talking to a doctor or counsellor');
});
