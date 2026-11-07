import { CODE_LABEL, acceptConsent, api, differentCode, enterCode, expect, expectAccountHome, expectGuestHome, mailCount, requestCode, signOut, signUp, test, uniqueEmail, waitForCode } from './support';

test('sign-up: email, code, consent gate, home', async ({ page, context, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/me$/, 403);
  const email = uniqueEmail('signup');
  await enterCode(page, await requestCode(page, email));
  await expect(page.getByRole('heading', { level: 1, name: 'Before we save anything' })).toBeVisible();

  // The account exists, but nothing about it is reachable until consent.
  const http = api(context);
  for (const path of ['/assessments', '/journal']) {
    const response = await http.get(path);
    expect(response.status(), path).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe('consent_required');
  }
  expect((await http.send('PATCH', '/me', { displayName: 'Too early' })).status()).toBe(403);
  expect((await http.send('POST', '/journal', {})).status()).toBe(403);
  expect((await http.get('/me')).status()).toBe(200);

  // No route around the gate.
  await page.goto('/trends');
  await expect(page).toHaveURL(/\/consent\?next=%2Ftrends$/);
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Please tick both boxes');
  await page.getByRole('checkbox', { name: 'I am 18 or older.' }).check();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Please tick both boxes');
  expect((await http.get('/assessments')).status()).toBe(403);

  await page.getByRole('checkbox', { name: /I agree to AnxioCare storing/ }).check();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(page).toHaveURL(/\/trends$/);
  expect((await http.get('/assessments')).status()).toBe(200);
  await page.goto('/');
  await expectAccountHome(page);
});

test('declining consent signs out and leaves the app usable as a guest', async ({ page, context }) => {
  await enterCode(page, await requestCode(page, uniqueEmail('decline')));
  await page.getByRole('button', { name: 'Not now, sign me out' }).click();
  await expectGuestHome(page);
  expect((await api(context).get('/me')).status()).toBe(401);
});

test('a wrong code says so, keeps the form usable, and the right code still works', async ({ page, guard }) => {
  guard.expectHttpError(/^\/api\/v1\/auth\/otp\/verify$/, 400);
  const email = uniqueEmail('wrong');
  const code = await requestCode(page, email);
  await enterCode(page, differentCode(code));
  await expect(page.getByRole('alert')).toHaveText("That code didn't work. Check the latest email, or send a new code.");
  await expect(page.getByLabel(CODE_LABEL)).toHaveValue('');
  await expect(page.getByLabel(CODE_LABEL)).toBeFocused();
  await enterCode(page, code);
  await acceptConsent(page);
  await expectAccountHome(page);
});

test('resend waits out its cooldown, and only the newest code works', async ({ page, guard }) => {
  test.setTimeout(120_000);
  guard.expectHttpError(/^\/api\/v1\/auth\/otp\/verify$/, 400);
  const email = uniqueEmail('resend');
  const first = await requestCode(page, email);

  const resend = page.getByRole('button', { name: /Send a new code/ });
  await expect(resend).toBeDisabled();
  await expect(resend).toHaveText(/Send a new code in \d+s/);
  expect(mailCount(email, 'login')).toBe(1);

  // The cooldown really is 45 seconds, so this one wait is the behaviour under test.
  await expect(page.getByRole('button', { name: 'Send a new code', exact: true })).toBeEnabled({ timeout: 50_000 });
  await resend.click();
  await expect(page.getByText('New code sent. Use the latest one.')).toBeVisible();
  await expect(resend).toBeDisabled();
  const second = await waitForCode(email, 'login', 1);

  if (first !== second) {
    await enterCode(page, first);
    await expect(page.getByRole('alert')).toContainText("That code didn't work");
  }
  await enterCode(page, second);
  await acceptConsent(page);
  await expectAccountHome(page);
});

test('signing in again skips consent, and goes back to where it was headed', async ({ page }) => {
  const email = await signUp(page, 'return');
  await signOut(page);

  const seen: string[] = [];
  page.on('framenavigated', (frame) => seen.push(frame.url()));
  await page.goto('/journal');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fjournal$/);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code instead' }).click();
  await enterCode(page, await waitForCode(email, 'login', 1));
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Your thought records' })).toBeVisible();
  expect(seen.filter((u) => u.includes('/consent'))).toEqual([]);
});
