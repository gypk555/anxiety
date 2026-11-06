import { api, expect, expectGuestHome, enterCode, seedAssessment, seedJournal, signOut, signUp, test, waitForCode } from './support';

test("another user's result and thought record are simply not found", async ({ page, context, newContext, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/(assessments|journal)\//, 404);
  await signUp(page, 'owner');
  const result = await seedAssessment(context, [3, 3, 3, 3, 3, 3, 3], 3);
  const entry = await seedJournal(context, { thought: 'Only the owner may read this' });

  const b = await newContext();
  const bPage = await b.newPage();
  await signUp(bPage, 'stranger');

  for (const path of [`/result/${result.id}`, `/journal/${entry.id}`, `/journal/${entry.id}/edit`]) {
    await bPage.goto(path);
    await expect(bPage.getByRole('heading', { level: 1, name: "There's nothing at this address" })).toBeVisible();
    await expect(bPage).toHaveTitle('Page not found | AnxioCare');
    await expect(bPage.getByText('Only the owner may read this')).toBeHidden();
    await expect(bPage.getByText('21 out of 21')).toBeHidden();
    await expect(bPage.getByRole('link', { name: 'Get help' })).toBeVisible();
  }

  const http = api(b);
  expect((await http.get(`/assessments/${result.id}`)).status()).toBe(404);
  expect((await http.get(`/journal/${entry.id}`)).status()).toBe(404);
  expect((await http.send('DELETE', `/assessments/${result.id}`)).status()).toBe(404);
  expect((await http.send('DELETE', `/journal/${entry.id}`)).status()).toBe(404);
  expect((await http.send('PATCH', `/journal/${entry.id}`, { ...entry, id: undefined, createdAt: undefined, updatedAt: undefined })).status()).toBe(404);

  // And the owner's are untouched.
  expect((await api(context).get(`/assessments/${result.id}`)).status()).toBe(200);
  expect((await api(context).get(`/journal/${entry.id}`)).status()).toBe(200);
});

test('malformed ids are not found, not an error page', async ({ page, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/(assessments|journal)\//, 404);
  await signUp(page, 'malformed');
  for (const path of ['/result/not-a-uuid', '/journal/not-a-uuid']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: "There's nothing at this address" })).toBeVisible();
  }
});

test('after sign-out the back button shows no data, and data routes go to sign-in', async ({ page, context }) => {
  await signUp(page, 'back');
  const result = await seedAssessment(context, [2, 2, 2, 2, 2, 2, 2], 2);
  const entry = await seedJournal(context, { thought: 'A very private thought' });
  const tabs = page.getByRole('navigation', { name: 'Main' });

  await tabs.getByRole('link', { name: 'Trends' }).click();
  await expect(page.getByText('Moderate, 14 out of 21').first()).toBeVisible();
  await tabs.getByRole('link', { name: 'Journal' }).click();
  await page.getByRole('link', { name: /A very private thought/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A very private thought');
  await tabs.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expectGuestHome(page);
  expect(await context.cookies()).toEqual([]);

  // Back into the record: the app must ask for a sign-in, without showing anything from before.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(`/journal/${entry.id}`)}$`));
  await expect(page.getByText('A very private thought')).toBeHidden();
  expect(await page.content()).not.toContain('A very private thought');

  for (const path of ['/trends', '/journal', `/result/${result.id}`, `/journal/${entry.id}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in with your email' })).toBeVisible();
    expect(await page.content()).not.toContain('14 out of 21');
  }
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: "You're not signed in" })).toBeVisible();
});

test('a data route returns to itself after signing in', async ({ page, context }) => {
  const email = await signUp(page, 'returnto');
  const result = await seedAssessment(context, [1, 1, 1, 1, 1, 1, 1], 1);
  await signOut(page);
  await page.goto(`/result/${result.id}`);
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await enterCode(page, await waitForCode(email, 'login', 1));
  await expect(page).toHaveURL(new RegExp(`/result/${result.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('7 out of 21');
});

test('the next person on the same tab sees nothing of the last person', async ({ page, context }) => {
  await signUp(page, 'first');
  await seedAssessment(context, [3, 3, 3, 3, 3, 3, 3], 3);
  await seedJournal(context, { thought: 'First person thought' });
  await page.goto('/trends');
  await expect(page.getByText('Severe, 21 out of 21').first()).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expectGuestHome(page);

  // No page load in between: anything left in memory would show.
  await page.getByRole('link', { name: 'Sign in to see saved results' }).click();
  const email = `second-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await enterCode(page, await waitForCode(email, 'login'));
  await page.getByRole('checkbox', { name: 'I am 18 or older.' }).check();
  await page.getByRole('checkbox', { name: /I agree to AnxioCare storing/ }).check();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(page.getByRole('heading', { name: 'No check-ins saved yet' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Trends' }).click();
  await expect(page.getByText('Nothing to show yet.')).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
  expect(await page.content()).not.toContain('First person thought');
});
