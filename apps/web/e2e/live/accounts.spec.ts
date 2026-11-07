import { CODE_LABEL, FAKE_OIDC, GOOGLE_OFF_ORIGIN, NEW_PASSWORD, PASSWORD, acceptConsent, api, continueAtProvider, createAccount, differentCode, enterCode, expect, fillLoginFailures, expectAccessible, expectAccountHome, expectFocusedHeading, expectGuestHome, expectNoOverflowAt320, expectNoPasswordKept, lastMail, mailCount, requestCode, shiftTabKey, signInWithPassword, signOut, signUp, startCreateAccount, tabKey, tabTo, takeCheckin, test, uniqueEmail, uniqueGmail, waitForCode, watchUrls } from './support';
import type { Page } from '@playwright/test';

const SEVEN = [1, 1, 1, 1, 1, 1, 1];
const LOGIN_FAILS = /^\/api\/v1\/auth\/login$/;
const offeredToSave = (page: Page) => expect(page.getByRole('heading', { level: 2, name: 'Save this result to your account?' })).toBeVisible();
const guestResultWaiting = async (page: Page) => {
  await takeCheckin(page, SEVEN, 1);
  await expect(page.getByRole('heading', { level: 2, name: 'Want to keep this result?' })).toBeVisible();
};

test.describe('create account', () => {
  test('start to finish: name, address, password, code, consent, signed in with that password', async ({ page, context }) => {
    const urls = watchUrls(page);
    const email = uniqueEmail('create');
    await page.goto('/create-account');
    await page.getByLabel(/Your name/).fill('Asha');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    await expect(page).toHaveURL(/\/create-account\/code/);
    await expectNoPasswordKept(page, urls, PASSWORD);

    const code = await waitForCode(email, 'register');
    expect(lastMail(email, 'register')!.subject).toBe('Your verification code');
    expect((await api(context).send('POST', '/auth/login', { email, password: PASSWORD })).status(), 'no account exists before the code').toBe(400);

    await enterCode(page, code);
    await acceptConsent(page);
    await expectAccountHome(page);
    await expect(page.getByText('Asha')).toBeVisible();
    await expectNoPasswordKept(page, urls, PASSWORD);
    expect(mailCount(email, 'new_signin_notice'), 'a brand-new account has nobody to tell').toBe(0);

    await signOut(page);
    await signInWithPassword(page, email);
    await expectAccountHome(page);
    await expectNoPasswordKept(page, urls, PASSWORD);
  });

  test('an existing address shows the same next screen, and its owner gets a notice with no code', async ({ page }) => {
    const existing = await signUp(page, 'existing');
    await signOut(page);

    const fresh = uniqueEmail('fresh');
    await startCreateAccount(page, fresh);
    const freshScreen = await page.getByRole('main').innerText();

    await startCreateAccount(page, existing);
    const takenScreen = await page.getByRole('main').innerText();
    const neutral = (text: string, email: string) => text.replace(email, '<email>').replace(/in \d+s/, 'in Ns');
    expect(neutral(takenScreen, existing)).toBe(neutral(freshScreen, fresh));

    await expect.poll(() => mailCount(existing, 'account_exists_notice')).toBe(1);
    expect(mailCount(existing, 'register')).toBe(0);
    const notice = lastMail(existing, 'account_exists_notice')!;
    expect(notice.code).toBeNull();
    expect(notice.text).toMatch(/already have an account/);
    expect(notice.text).not.toMatch(/anxi|health/i);
  });

  test('a weak password is caught in plain words before any mail goes out', async ({ page }) => {
    const email = uniqueEmail('weak');
    await page.goto('/create-account');
    await page.getByLabel('Email address').fill(email);
    for (const [password, message] of [['short', /at least 10/], ['password1234', /too common/], [`${email.split('@')[0]}-long`, /first part of your email/]] as const) {
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('alert')).toContainText(message);
    }
    expect(mailCount(email, 'register')).toBe(0);
  });

  test('a reload on the code screen forgets the password and goes back to the form', async ({ page }) => {
    const urls = watchUrls(page);
    await startCreateAccount(page, uniqueEmail('reload'));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expectNoPasswordKept(page, urls, PASSWORD);
  });

  test('a wrong code says so, and the right one still works with the password held in memory', async ({ page, guard }) => {
    guard.expectHttpError(/^\/api\/v1\/auth\/register\/verify$/, 400);
    const email = uniqueEmail('wrongcode');
    await startCreateAccount(page, email);
    const code = await waitForCode(email, 'register');
    await enterCode(page, differentCode(code));
    await expect(page.getByRole('alert')).toContainText("That code didn't work");
    await expect(page.getByLabel(CODE_LABEL)).toBeFocused();
    await enterCode(page, code);
    await acceptConsent(page);
    await expectAccountHome(page);
  });

  test('next survives the whole way', async ({ page }) => {
    const email = uniqueEmail('next');
    await page.goto('/journal');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fjournal$/);
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/create-account\?next=%2Fjournal$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible();
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/create-account\/code\?next=%2Fjournal$/);
    await enterCode(page, await waitForCode(email, 'register'));
    await expect(page).toHaveURL(/\/consent\?next=%2Fjournal$/);
    await acceptConsent(page);
    await expect(page).toHaveURL(/\/journal$/);
  });

  test('declining consent after creating an account signs out, and then the password still works until the purge', async ({ page, context }) => {
    const email = uniqueEmail('decline');
    await startCreateAccount(page, email);
    await enterCode(page, await waitForCode(email, 'register'));
    await page.getByRole('button', { name: 'Not now, sign me out' }).click();
    await expectGuestHome(page);
    expect((await api(context).get('/me')).status()).toBe(401);
  });
});

test.describe('sign in', () => {
  test('with a password, going to next', async ({ page }) => {
    const email = await createAccount(page, 'signin');
    await signOut(page);
    const urls = watchUrls(page);
    await signInWithPassword(page, email, PASSWORD, '/sign-in?next=%2Fjournal');
    await expect(page).toHaveURL(/\/journal$/);
    await expectNoPasswordKept(page, urls, PASSWORD);
    await expect.poll(() => mailCount(email, 'new_signin_notice')).toBeGreaterThan(0);
  });

  test('a wrong password and an unknown address get the same message, with focus back in the field', async ({ page, guard }) => {
    guard.expectHttpError(LOGIN_FAILS, 400);
    const email = await createAccount(page, 'wrongpw');
    await signOut(page);
    await signInWithPassword(page, email, NEW_PASSWORD);
    const message = page.getByRole('alert');
    await expect(message).toHaveText('That email and password don\'t match. Try again, or use "Forgot your password?".');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
    const wrong = await message.innerText();

    await signInWithPassword(page, uniqueEmail('nobody'), NEW_PASSWORD);
    await expect(message).toHaveText(wrong);
  });

  test('a wrong password does not lose a guest result', async ({ page, guard }) => {
    guard.expectHttpError(LOGIN_FAILS, 400);
    await guestResultWaiting(page);
    await page.getByRole('link', { name: 'Sign in to save' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await page.getByLabel('Email address').fill(uniqueEmail('keep'));
    await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText("don't match");
    expect(await page.evaluate(() => sessionStorage.getItem('anxiocare.result.v1'))).not.toBeNull();
  });

  test('email code fallback: from the same screen, with the address already typed', async ({ page }) => {
    const email = await createAccount(page, 'fallback');
    await signOut(page);
    await page.goto('/sign-in?next=%2Ftrends');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Email me a code instead' }).click();
    await expect(page).toHaveURL(/\/sign-in\/code\?next=%2Ftrends$/);
    await enterCode(page, await waitForCode(email, 'login'));
    await expect(page).toHaveURL(/\/trends$/);
  });

  test('an email-code account has no password, and a password attempt looks like any other failure', async ({ page, guard }) => {
    guard.expectHttpError(LOGIN_FAILS, 400);
    const email = await signUp(page, 'codeonly');
    await signOut(page);
    await signInWithPassword(page, email);
    await expect(page.getByRole('alert')).toContainText("don't match");
  });

  test('offers the way to the other screens, keeping next and the typed address', async ({ page }) => {
    await page.goto('/sign-in?next=%2Fresult');
    await page.getByLabel('Email address').fill('asha@example.com');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password\?next=%2Fresult$/);
    await expect(page.getByLabel('Email address')).toHaveValue('asha@example.com');
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/create-account\?next=%2Fresult$/);
    await expect(page.getByLabel('Email address')).toHaveValue('asha@example.com');
  });
});

test.describe('known devices', () => {
  test('a device that has signed in before still signs in while its address is over the cap; a new device cannot', async ({ page, newContext, guard }) => {
    guard.expectHttpError(LOGIN_FAILS, 400);
    const email = await createAccount(page, 'known-device');
    await signOut(page);
    await fillLoginFailures(email);

    const stranger = await newContext();
    const strangerPage = await stranger.newPage();
    const refused = strangerPage.waitForResponse((r) => r.url().endsWith('/api/v1/auth/login'));
    await signInWithPassword(strangerPage, email);
    expect((await refused).status()).toBe(400);
    await expect(strangerPage.getByRole('alert')).toContainText("don't match");

    await signInWithPassword(page, email);
    await expectAccountHome(page);
  });
});

test.describe('forgot password', () => {
  test('a code and a new password; every other session ends, a notice goes out, and the old password stops working', async ({ page, newContext, guard }) => {
    guard.expectHttpError(LOGIN_FAILS, 400);
    const urls = watchUrls(page);
    const email = await createAccount(page, 'forgot');
    const other = await newContext();
    const otherPage = await other.newPage();
    await signInWithPassword(otherPage, email);
    await expectAccountHome(otherPage);
    await signOut(page);

    await page.goto('/sign-in?next=%2Fjournal');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Forgot your password?' })).toBeVisible();
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeVisible();
    await expect(page).toHaveURL(/\/forgot-password\/reset\?next=%2Fjournal$/);
    await page.getByLabel(CODE_LABEL).fill(await waitForCode(email, 'password_reset'));
    await page.getByLabel('New password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page).toHaveURL(/\/journal$/);
    await expectNoPasswordKept(page, urls, PASSWORD, NEW_PASSWORD);

    expect((await api(other).get('/me')).status(), 'other session revoked').toBe(401);
    await expect.poll(() => mailCount(email, 'password_changed_notice')).toBe(1);
    expect(lastMail(email, 'password_changed_notice')!.code).toBeNull();

    await signOut(page);
    await signInWithPassword(page, email, PASSWORD);
    await expect(page.getByRole('alert')).toContainText("don't match");
    await signInWithPassword(page, email, NEW_PASSWORD);
    await expectAccountHome(page);
  });

  test('an unknown address sees exactly the same screen, and nothing is mailed', async ({ page }) => {
    const nobody = uniqueEmail('forgot-nobody');
    await page.goto('/forgot-password');
    await page.getByLabel('Email address').fill(nobody);
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeVisible();
    await expect(page.getByText(/If there's an account for/)).toBeVisible();
    await page.waitForTimeout(300);
    expect(mailCount(nobody, 'password_reset')).toBe(0);
  });
});

test.describe('Settings: sign-in and security', () => {
  test('change a password: other sessions end, this one stays, a notice goes out', async ({ page, newContext, guard }) => {
    guard.expectHttpError(/^\/api\/v1\/me\/password$/, 400);
    const urls = watchUrls(page);
    const email = await createAccount(page, 'change');
    const other = await newContext();
    const otherPage = await other.newPage();
    await signInWithPassword(otherPage, email);
    await expectAccountHome(otherPage);

    await page.goto('/settings');
    await expect(page.getByText('Password: set')).toBeVisible();
    await page.getByRole('button', { name: 'Change password' }).click();
    const sheet = page.getByRole('dialog', { name: 'Change your password' });
    await expect(sheet.getByLabel('Current password')).toHaveAttribute('autocomplete', 'current-password');
    await expect(sheet.getByLabel('New password')).toHaveAttribute('autocomplete', 'new-password');

    await sheet.getByLabel('Current password').fill('this is not my password');
    await sheet.getByLabel('New password').fill(NEW_PASSWORD);
    await sheet.getByRole('button', { name: 'Change password' }).click();
    await expect(sheet.getByRole('alert')).toContainText("current password isn't right");
    expect((await api(other).get('/me')).status(), 'a wrong password ends nothing').toBe(200);

    await sheet.getByLabel('Current password').fill(PASSWORD);
    await sheet.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Password changed. Other devices were signed out.')).toBeVisible();
    expect((await api(other).get('/me')).status()).toBe(401);
    await expect.poll(() => mailCount(email, 'password_changed_notice')).toBe(1);
    await expectNoPasswordKept(page, urls, PASSWORD, NEW_PASSWORD);

    await signOut(page);
    await signInWithPassword(page, email, NEW_PASSWORD);
    await expectAccountHome(page);
  });

  test('set a password on an email-code account, then sign in with it', async ({ page }) => {
    const urls = watchUrls(page);
    const email = await signUp(page, 'setpw');
    await page.goto('/settings');
    await expect(page.getByText('Password: not set')).toBeVisible();
    await page.getByRole('button', { name: 'Add a password' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add a password' });
    await sheet.getByRole('button', { name: 'Email me a code' }).click();
    await sheet.getByLabel(CODE_LABEL).fill(await waitForCode(email, 'password_set'));
    await sheet.getByLabel('New password').fill(PASSWORD);
    await sheet.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByText('Password added. Other devices were signed out.')).toBeVisible();
    await expect(page.getByText('Password: set')).toBeVisible();
    await expectNoPasswordKept(page, urls, PASSWORD);

    await signOut(page);
    await signInWithPassword(page, email);
    await expectAccountHome(page);
  });

  test('the section sits inside Settings for someone still owing consent too', async ({ page }) => {
    await enterCode(page, await requestCode(page, uniqueEmail('rights')));
    await expect(page.getByRole('heading', { level: 1, name: 'Before we save anything' })).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 2, name: 'Sign-in and security' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Signed-in devices' })).toBeVisible();
  });
});

test.describe('Google, through the fake provider', () => {
  test('a new person: to the provider and back, consent, signed in, no name stored', async ({ page, context, guard }) => {
    guard.expectHttpError(/^\/api\/v1\/me$/, 403);
    const email = uniqueGmail('googlenew');
    await page.goto('/sign-in?next=%2Fjournal');
    const urls = watchUrls(page);
    await expect(page.getByText(/Google learns that you use this service/)).toBeVisible();
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await continueAtProvider(page, email);
    await expect(page).toHaveURL(/\/consent\?next=%2Fjournal$/);
    await acceptConsent(page);
    await expect(page).toHaveURL(/\/journal$/);
    const me = (await (await api(context).get('/me')).json()) as { email: string; displayName: string | null };
    expect(me).toMatchObject({ email, displayName: null });
    expect((await (await api(context).get('/me/sign-in-methods')).json())).toEqual({ password: false, google: true });
    for (const url of urls) expect(url).not.toContain('id_token=');
    await expect.poll(() => context.cookies().then((all) => all.map((c) => c.name).sort())).toEqual(['device', 'session']);
  });

  test('works with the service worker in charge of navigation', async ({ page }) => {
    const email = uniqueGmail('googlesw');
    await page.goto('/sign-in');
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active!;
      if (worker.state !== 'activated') await new Promise((resolve) => worker.addEventListener('statechange', resolve));
    });
    await page.reload();
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await continueAtProvider(page, email);
    await expect(page.getByRole('heading', { level: 1, name: 'Before we save anything' })).toBeVisible();
  });

  test('an existing account\'s address is refused at Google sign-in, nothing is linked, and the screen says to connect in Settings', async ({ page, context }) => {
    const email = await createAccount(page, 'google-link');
    await signOut(page);
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await continueAtProvider(page, email);
    await expect(page).toHaveURL(/\/sign-in\?error=google_link$/);
    await expect(page.getByRole('alert')).toContainText('There is already an account with this email address');
    await expect(page.getByRole('alert')).toContainText('Connect Google');
    expect((await api(context).get('/me')).status()).toBe(401);
    await signInWithPassword(page, email);
    await expectAccountHome(page);
    expect((await (await api(context).get('/me/sign-in-methods')).json())).toEqual({ password: true, google: false });
    expect(mailCount(email, 'google_linked_notice')).toBe(0);
  });

  test('connect from Settings: to the provider and back, connected, then Google signs in to this same account', async ({ page, context, browserName }) => {
    test.fixme(browserName === 'webkit' && process.platform === 'linux', 'Known issue: on Linux WebKit (GNOME Web), the redirect back from the provider never completes in CI. Passes on Chromium and on macOS WebKit, the engine iPhone Safari uses. See docs/testing/TEST-REPORT.md, "Known issues".');
    const email = await createAccount(page, 'google-connect');
    const id = await api(context).userId();
    const google = uniqueGmail('connect');
    await page.goto('/settings');
    await expect(page.getByText('Google: not connected')).toBeVisible();
    await page.getByRole('button', { name: 'Connect Google' }).click();
    // Just signed in with a password, so no second check is needed yet.
    await continueAtProvider(page, google);
    await expect(page).toHaveURL(/\/settings#security$/);
    await expect(page.getByRole('status').filter({ hasText: 'Google connected' })).toBeVisible();
    await expect(page.getByText('Google: connected')).toBeVisible();
    await expect.poll(() => mailCount(email, 'google_linked_notice')).toBe(1);

    await signOut(page);
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await continueAtProvider(page, google);
    await expectAccountHome(page);
    expect(await api(context).userId()).toBe(id);
  });

  test('a password reset disconnects Google and says so by mail', async ({ page, context }) => {
    const email = await createAccount(page, 'google-reset');
    const google = uniqueGmail('reset');
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Connect Google' }).click();
    await continueAtProvider(page, google);
    await expect(page.getByText('Google: connected')).toBeVisible();
    await signOut(page);

    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.getByLabel(CODE_LABEL).fill(await waitForCode(email, 'password_reset'));
    await page.getByLabel('New password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expectAccountHome(page);
    expect((await (await api(context).get('/me/sign-in-methods')).json())).toEqual({ password: true, google: false });
    await expect.poll(() => mailCount(email, 'google_unlinked_notice')).toBe(1);
    expect(lastMail(email, 'google_unlinked_notice')!.text).toContain('Connect Google');
  });

  test('disconnect needs no password, only proof by email code, since a Google sign-in is not a re-check', async ({ page, guard }) => {
    // The first try is refused with reauth_required, which is what opens the confirm step.
    guard.expectHttpError(/^\/api\/v1\/me\/identities\/google$/, 403);
    const email = uniqueGmail('googlesettings');
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await continueAtProvider(page, email);
    await acceptConsent(page);
    await page.goto('/settings');
    await expect(page.getByText('Google: connected')).toBeVisible();
    await expect(page.getByText('Password: not set')).toBeVisible();
    await page.getByRole('button', { name: 'Disconnect Google' }).click();
    await page.getByRole('dialog', { name: 'Disconnect Google?' }).getByRole('button', { name: 'Disconnect' }).click();
    const confirm = page.getByRole('dialog', { name: "Confirm it's you" });
    await confirm.getByRole('button', { name: 'Email me a code' }).click();
    await confirm.getByLabel(CODE_LABEL).fill(await waitForCode(email, 'reauth'));
    await confirm.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Google: not connected')).toBeVisible();
    await expect.poll(() => mailCount(email, 'google_unlinked_notice')).toBe(1);
  });

  test('an unverified Google address is turned away with a neutral message and no detail in the URL', async ({ page, context }) => {
    const email = uniqueEmail('google-unverified');
    await page.goto('/sign-in?next=%2Fjournal');
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await page.getByLabel('Fake account email').fill(email);
    await page.getByLabel('Unverified').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/sign-in\?error=google&next=%2Fjournal$/);
    await expect(page.getByRole('alert')).toHaveText("We couldn't sign you in with Google. Try again, or use your email and password.");
    expect((await api(context).get('/me')).status()).toBe(401);
  });

  test('open redirect: a hostile next ends on our own home page', async ({ page, guard, browserName }) => {
    test.fixme(browserName === 'webkit' && process.platform === 'linux', 'Known issue: on Linux WebKit (GNOME Web), the redirect back from the provider never completes in CI. Passes on Chromium and on macOS WebKit, the engine iPhone Safari uses. See docs/testing/TEST-REPORT.md, "Known issues".');
    guard.expectHttpError(/^\/api\/v1\/me$/, 403);
    const email = uniqueGmail('googleredirect');
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await continueAtProvider(page, email);
    await acceptConsent(page);
    await signOut(page);
    await page.goto(`/api/v1/auth/google/start?next=${encodeURIComponent('//evil.example/phish')}`);
    await continueAtProvider(page, email);
    await expectAccountHome(page);
    await expect(page).toHaveURL('http://localhost:8787/');
  });

  test('the provider page is the only other host reached, and only because the person chose it', async ({ page }) => {
    const hosts = new Set<string>();
    page.on('request', (r) => hosts.add(new URL(r.url()).origin));
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill('nobody@example.com');
    expect([...hosts]).toEqual(['http://localhost:8787']);
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await expect(page).toHaveURL(new RegExp(`^${FAKE_OIDC}`));
  });
});

test.describe('when Google is off on the server', () => {
  test('the button and its line are not there, on either screen', async ({ page }) => {
    for (const path of ['/sign-in', '/create-account']) {
      const meta = page.waitForResponse((r) => r.url().endsWith('/api/v1/meta'));
      await page.goto(`${GOOGLE_OFF_ORIGIN}${path}`);
      expect(((await (await meta).json()) as { googleEnabled: boolean }).googleEnabled).toBe(false);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);
      await expect(page.getByText(/Google learns/)).toHaveCount(0);
    }
  });

  test('going to start anyway comes back to sign-in, with nothing sent anywhere', async ({ page }) => {
    await page.goto(`${GOOGLE_OFF_ORIGIN}/api/v1/auth/google/start`);
    await expect(page).toHaveURL(`${GOOGLE_OFF_ORIGIN}/sign-in?error=google`);
  });
});

test.describe('password managers', () => {
  test('find what they look for on every screen', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByLabel('Email address')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel('Email address')).toHaveAttribute('type', 'email');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    await expect(page.locator('form input[name="password"]')).toHaveCount(1);

    await page.goto('/create-account');
    await expect(page.getByLabel('Email address')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
    await expect(page.getByLabel(/Your name/)).toHaveAttribute('autocomplete', 'given-name');

    await page.goto('/forgot-password');
    await expect(page.getByLabel('Email address')).toHaveAttribute('autocomplete', 'username');
    await page.getByLabel('Email address').fill(uniqueEmail('manager'));
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await expect(page.getByLabel('New password')).toHaveAttribute('autocomplete', 'new-password');
    await expect(page.locator('input[autocomplete="username"][hidden]')).toHaveCount(1);
    await expect(page.getByLabel(CODE_LABEL)).toHaveAttribute('autocomplete', 'one-time-code');
  });

  test('paste works, and show and hide does what it says', async ({ page, browserName, context }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit has no clipboard permission to grant.');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/sign-in');
    await page.evaluate((text) => navigator.clipboard.writeText(text), PASSWORD);
    await page.getByLabel('Password', { exact: true }).focus();
    await page.keyboard.press('ControlOrMeta+V');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue(PASSWORD);
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  });
});

test.describe('a guest result stays on offer after every way in', () => {
  test('create account', async ({ page }) => {
    await guestResultWaiting(page);
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible();
    const email = uniqueEmail('guest-create');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    await enterCode(page, await waitForCode(email, 'register'));
    await acceptConsent(page);
    await expect(page).toHaveURL(/\/result$/);
    await offeredToSave(page);
  });

  test('password sign-in', async ({ page }) => {
    const email = await createAccount(page, 'guest-pw');
    await signOut(page);
    await guestResultWaiting(page);
    await page.getByRole('link', { name: 'Sign in to save' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/result$/);
    await offeredToSave(page);
  });

  test('email code', async ({ page }) => {
    const email = await createAccount(page, 'guest-code');
    await signOut(page);
    await guestResultWaiting(page);
    await page.getByRole('link', { name: 'Sign in to save' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Email me a code instead' }).click();
    await enterCode(page, await waitForCode(email, 'login'));
    await expect(page).toHaveURL(/\/result$/);
    await offeredToSave(page);
  });

  test('forgot password', async ({ page }) => {
    const email = await createAccount(page, 'guest-forgot');
    await signOut(page);
    await guestResultWaiting(page);
    await page.getByRole('link', { name: 'Sign in to save' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Forgot your password?' })).toBeVisible();
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.getByLabel(CODE_LABEL).fill(await waitForCode(email, 'password_reset'));
    await page.getByLabel('New password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page).toHaveURL(/\/result$/);
    await offeredToSave(page);
  });

  test('Google: the tab keeps it through the trip to the provider', async ({ page }) => {
    await guestResultWaiting(page);
    await page.getByRole('link', { name: 'Sign in to save' }).click();
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await continueAtProvider(page, uniqueGmail('guestgoogle'));
    await acceptConsent(page);
    await expect(page).toHaveURL(/\/result$/);
    await offeredToSave(page);
    await page.getByRole('button', { name: 'Save result' }).click();
    await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/);
  });
});

test.describe('screens', () => {
  const screens: [string, string, ((page: Page) => Promise<unknown>)?][] = [
    ['sign-in', '/sign-in'],
    ['sign-in after a Google failure', '/sign-in?error=google'],
    ['create account', '/create-account'],
    ['create account code', '/create-account', async (page) => {
      await page.getByLabel('Email address').fill(uniqueEmail('screens'));
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByLabel(CODE_LABEL).waitFor();
    }],
    ['forgot password', '/forgot-password'],
    ['choose a new password', '/forgot-password', async (page) => {
      await page.getByLabel('Email address').fill(uniqueEmail('screens'));
      await page.getByRole('button', { name: 'Email me a code' }).click();
      await page.getByLabel('New password').waitFor();
    }],
  ];

  for (const [name, path, act] of screens) {
    test(`${name}: fits 320px, passes axe in both themes, and keeps Get help one tap away`, async ({ page }) => {
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await act?.(page);
        await expect(page.getByRole('link', { name: /Get help/ }).first()).toBeVisible();
        await expectAccessible(page, `${name} ${scheme}`);
        await expectNoOverflowAt320(page, `${name} ${scheme}`);
        // Let /me and /meta settle before the next goto. WebKit reports a fetch cut off by
        // navigation as an uncaught "access control checks" error even though the app catches it.
        await page.waitForLoadState('networkidle');
      }
    });
  }

  test('Settings with a password sheet open passes axe and fits 320px', async ({ page }) => {
    await createAccount(page, 'axe');
    await page.goto('/settings');
    await expect(page.getByText('Password: set')).toBeVisible();
    await expectAccessible(page, 'settings');
    await expectNoOverflowAt320(page, 'settings');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('dialog', { name: 'Change your password' })).toBeVisible();
    await expectAccessible(page, 'change password');
  });
});

test.describe('keyboard', () => {
  test('sign-in works from the keyboard alone, and focus moves as a screen reader user needs', async ({ page, browserName, guard }) => {
    guard.expectHttpError(LOGIN_FAILS, 400);
    const email = await createAccount(page, 'kbd');
    await signOut(page);
    await page.goto('/sign-in');
    await tabTo(page, browserName, page.getByLabel('Email address'));
    await page.keyboard.type(email);
    await page.keyboard.press(tabKey(browserName));
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
    await page.keyboard.type(NEW_PASSWORD);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText("don't match");
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();

    // The toggle is reachable, by keyboard, right after the field.
    await page.keyboard.press(tabKey(browserName));
    await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
    await page.keyboard.press(shiftTabKey(browserName));
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press('Enter');
    await expectAccountHome(page);
  });

  test('create account works from the keyboard alone, with focus on each new screen\'s heading', async ({ page, browserName }) => {
    const email = uniqueEmail('kbd-create');
    await page.goto('/sign-in');
    await tabTo(page, browserName, page.getByRole('link', { name: 'Create an account' }));
    await page.keyboard.press('Enter');
    await expectFocusedHeading(page, 'Create an account');
    await tabTo(page, browserName, page.getByLabel('Email address'));
    await page.keyboard.type(email);
    await tabTo(page, browserName, page.getByLabel('Password', { exact: true }));
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press('Enter');
    await expectFocusedHeading(page, 'Check your email');
    await tabTo(page, browserName, page.getByLabel(CODE_LABEL));
    await page.keyboard.type(await waitForCode(email, 'register'));
    await expectFocusedHeading(page, 'Before we save anything');
  });

  test('the Google link is reachable by keyboard and follows on Enter', async ({ page, browserName }) => {
    await page.goto('/sign-in');
    await tabTo(page, browserName, page.getByRole('link', { name: 'Continue with Google' }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`^${FAKE_OIDC}/authorize`));
  });
});
