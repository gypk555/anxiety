import { DIFFICULTY_OPTIONS, DIFFICULTY_STEM, GAD7_ITEMS, GAD7_OPTIONS } from '@anxiocare/shared';
import { CODE_LABEL, expect, expectAccountHome, expectFocusedHeading, mailCount, shiftTabKey, signUp, tabKey, tabTo, test, uniqueEmail, waitForCode } from './support';

test('skip link: the first Tab reaches it, it shows, and it moves focus to the content', async ({ page, browserName }) => {
  await page.goto('/help');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press(tabKey(browserName));
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  const box = (await skip.boundingBox())!;
  expect(box.width).toBeGreaterThan(40);
  expect(box.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.keyboard.press(tabKey(browserName));
  const inMain = await page.evaluate(() => !!document.activeElement?.closest('#main'));
  expect(inMain, 'the next Tab stays in the content, past the header').toBe(true);
});

test('sign-in and consent, with the keyboard alone', async ({ page, browserName }) => {
  const email = uniqueEmail('keys');
  const after = mailCount(email, 'login');
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await tabTo(page, browserName, page.getByLabel('Email address'));
  await page.keyboard.type(email);
  await tabTo(page, browserName, page.getByRole('button', { name: 'Email me a code instead' }));
  await page.keyboard.press('Enter');
  await expectFocusedHeading(page, 'Check your email');

  const code = await waitForCode(email, 'login', after);
  await tabTo(page, browserName, page.getByLabel(CODE_LABEL));
  await page.keyboard.type(code);
  await expectFocusedHeading(page, 'Before we save anything');

  await tabTo(page, browserName, page.getByRole('checkbox', { name: 'I am 18 or older.' }));
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'I am 18 or older.' })).toBeChecked();
  await tabTo(page, browserName, page.getByRole('checkbox', { name: /I agree to AnxioCare storing/ }));
  await page.keyboard.press('Space');
  await tabTo(page, browserName, page.getByRole('button', { name: 'Agree and continue' }));
  await page.keyboard.press('Enter');
  await expectAccountHome(page);
});

test('check-in with arrow keys and Space: focus lands on each question in turn, then the result', async ({ page, browserName }) => {
  await page.goto('/check-in');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await tabTo(page, browserName, page.getByRole('button', { name: 'Begin' }));
  await page.keyboard.press('Enter');

  for (const item of GAD7_ITEMS) {
    await expectFocusedHeading(page, item);
    const first = page.getByRole('button', { name: GAD7_OPTIONS[0].label, exact: true });
    await tabTo(page, browserName, first, 6);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: GAD7_OPTIONS[1].label, exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('button', { name: GAD7_OPTIONS[1].label, exact: true })).toBeFocused();
    await page.keyboard.press('Space');
  }
  await expectFocusedHeading(page, DIFFICULTY_STEM);
  await tabTo(page, browserName, page.getByRole('button', { name: DIFFICULTY_OPTIONS[0].label, exact: true }), 6);
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { name: DIFFICULTY_OPTIONS[3].label, exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expectFocusedHeading(page, /Mild range|out of 21/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('7 out of 21');
});

test('a sheet takes focus, keeps it, closes on Esc, and hands it back', async ({ page, browserName }) => {
  await signUp(page, 'sheet');
  await page.goto('/settings');
  const opener = page.getByRole('button', { name: 'Delete my account' });
  await expect(opener).toBeVisible();
  await tabTo(page, browserName, opener, 60);
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(sheet).toBeVisible();
  const focusInside = () => page.evaluate(() => {
    const active = document.activeElement;
    return { inside: !!active?.closest('dialog[open]'), body: active === document.body };
  });
  await expect.poll(async () => (await focusInside()).inside).toBe(true);

  const seen = new Set<string>();
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press(i % 4 === 3 ? shiftTabKey(browserName) : tabKey(browserName));
    const { inside, body } = await focusInside();
    // Between its last control and its first, the browser may pause on its own chrome: that's the page body, never the page behind.
    expect(inside || body, `Tab ${i + 1} left the sheet`).toBe(true);
    seen.add(await page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute('aria-label') || ''));
  }
  expect(seen.size, 'Tab moves around the sheet').toBeGreaterThan(1);

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();

  // The same, closing with its own button, using the keyboard.
  await page.keyboard.press('Enter');
  await expect(sheet).toBeVisible();
  await expect.poll(async () => (await focusInside()).inside).toBe(true);
  await tabTo(page, browserName, sheet.getByRole('button', { name: 'Keep my account' }), 8);
  await page.keyboard.press('Enter');
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
});

test('moving between screens puts focus on the new heading, and sets the page title', async ({ page, browserName }) => {
  await page.goto('/tools');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await tabTo(page, browserName, page.getByRole('link', { name: /^Get help/ }));
  await page.keyboard.press('Enter');
  await expectFocusedHeading(page, 'If you or someone else is in immediate danger');
  await expect(page).toHaveTitle('Get help | AnxioCare');

  await tabTo(page, browserName, page.getByRole('link', { name: 'Breathe', exact: true }), 30);
  await page.keyboard.press('Enter');
  await expectFocusedHeading(page, 'Breathe with the circle');
  await expect(page).toHaveTitle('Breathe | AnxioCare');

  await page.goBack();
  await expectFocusedHeading(page, 'If you or someone else is in immediate danger');
});

test('theme options: one Tab stop, and arrow keys choose', async ({ page, browserName }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const checked = page.getByRole('radio', { checked: true });
  await tabTo(page, browserName, checked);
  const before = await checked.textContent();
  await page.keyboard.press('ArrowRight');
  await expect(checked).toBeFocused();
  expect(await checked.textContent()).not.toBe(before);
  await page.keyboard.press(tabKey(browserName));
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).not.toBe('radio');
});

test('a focused control is never left hidden behind the header or the tab bar', async ({ page, browserName }, info) => {
  await signUp(page, 'obscure');
  for (const viewport of [info.project.use.viewport!, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete my account' })).toBeVisible();
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press(tabKey(browserName));
      const hidden = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active === document.body) return null;
        const box = active.getBoundingClientRect();
        const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
        const bar = [...document.querySelectorAll('nav')].find((n) => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().height > 0);
        const barTop = bar?.getBoundingClientRect().top ?? innerHeight;
        if (active.closest('header') || active.closest('nav') || active.matches('a[href="#main"]')) return null;
        // 2.4.11: not entirely hidden. Scrolled fully under the header or the bar counts as hidden.
        return box.bottom <= headerBottom || box.top >= barTop ? `${active.tagName} "${active.textContent?.slice(0, 30)}" ${Math.round(box.top)}-${Math.round(box.bottom)}, visible band ${Math.round(headerBottom)}-${Math.round(barTop)}` : null;
      });
      expect(hidden, `${viewport.width}x${viewport.height}, Tab ${i + 1}`).toBeNull();
    }
  }
});

test('sounds start and stop from the keyboard, in the real browser, with no errors', async ({ page, browserName }) => {
  await page.goto('/tools/sounds');
  const rain = page.getByRole('button', { name: /Monsoon rain/ });
  await expect(rain).toBeVisible();
  await tabTo(page, browserName, rain);
  await page.keyboard.press('Space');
  await expect(rain).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(rain).toHaveAttribute('aria-pressed', 'false');
  // Past the fade, when the context closes. Any error fails the test through the guard.
  await page.waitForTimeout(1100);
});
