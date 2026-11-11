import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS, openScreen } from './screens';

/**
 * Run against the production build, under the production CSP, with the API mocked.
 * SCREENS_DIR=<dir> also saves screenshots of every screen, width and theme.
 */
const SIZES = [
  { width: 320, height: 568 },
  { width: 390, height: 780 },
  { width: 430, height: 860 },
  // A small phone on its side, or held by a fixed mount: WCAG 1.3.4.
  { width: 568, height: 320 },
] as const;
const THEMES = ['light', 'dark'] as const;
const SHOTS = process.env.SCREENS_DIR;

test.use({ serviceWorkers: 'block' });

async function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /content security policy|refused to/i.test(m.text())) violations.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return violations;
}

for (const screen of SCREENS) {
  for (const theme of THEMES) {
    test(`${screen.name} ${theme}`, async ({ page }, info) => {
      test.setTimeout(120_000);
      const violations = await watchCsp(page);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 390, height: 780 });
      await openScreen(page, screen);

      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const serious = axe.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary ?? ''}`).join(' | ')}`);
      expect(serious, 'axe serious or critical').toEqual([]);

      for (const { width, height } of SIZES) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(60);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `horizontal overflow at ${width}`).toBeLessThanOrEqual(0);
        if (SHOTS && info.project.name === 'pixel') {
          await page.screenshot({ path: `${SHOTS}/${screen.name}-${width}-${theme}.png`, fullPage: true });
        }
      }
      expect(violations, 'CSP violations').toEqual([]);
    });
  }
}

test('print view of a result', async ({ page }, info) => {
  const screen = SCREENS.find((s) => s.name === 'result-moderate')!;
  await openScreen(page, screen);
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  await expect(page.getByRole('heading', { name: 'GAD-7 screening answers' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Get help/ })).toBeHidden();
  if (SHOTS && info.project.name === 'pixel') await page.screenshot({ path: `${SHOTS}/result-print.png`, fullPage: true });
});

test('every touch target in the tab bar and header is at least 44px', async ({ page }) => {
  await openScreen(page, SCREENS[0]!);
  const sizes = await page.locator('header a, nav a').evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect().height),
  );
  expect(sizes.length).toBeGreaterThan(3);
  for (const h of sizes) expect(h).toBeGreaterThanOrEqual(44);
});

test('the installed app is not locked to one orientation', async ({ request }) => {
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as Record<string, unknown>;
  expect(manifest.name).toBe('AnxioCare');
  expect(manifest).not.toHaveProperty('orientation');
});

const LANDSCAPE = { width: 568, height: 320 };

test('landscape 568x320: the tab bar fits, and content can scroll clear of it', async ({ page }) => {
  await openScreen(page, SCREENS.find((s) => s.name === 'tools')!);
  await page.setViewportSize(LANDSCAPE);
  const bar = page.locator('nav[aria-label="Main"]').filter({ has: page.getByRole('link', { name: 'Settings' }) }).last();
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(LANDSCAPE.width);
  expect(box.height).toBeLessThanOrEqual(LANDSCAPE.height / 4);
  expect(box.y + box.height).toBeLessThanOrEqual(LANDSCAPE.height);
  for (const link of await bar.getByRole('link').all()) {
    const target = (await link.boundingBox())!;
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.x + target.width).toBeLessThanOrEqual(LANDSCAPE.width);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = (await page.locator('main > *').last().locator('a, button, li, p').last().boundingBox())!;
  expect(last.y + last.height, 'last content ends above the tab bar').toBeLessThanOrEqual(box.y);
});

for (const name of ['checkin-q1', 'checkin-q2-long', 'checkin-difficulty']) {
  test(`landscape 568x320: ${name} fits, and every answer can be reached clear of the header`, async ({ page }) => {
    await openScreen(page, SCREENS.find((s) => s.name === name)!);
    await page.setViewportSize(LANDSCAPE);
    await page.waitForTimeout(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await expect(page.getByRole('link', { name: /Get help/ })).toBeVisible();
    const headerBottom = (await page.locator('header').boundingBox())!;
    const options = await page.getByRole('group').getByRole('button').all();
    expect(options).toHaveLength(4);
    for (const option of options) {
      await option.scrollIntoViewIfNeeded();
      await expect(option).toBeInViewport({ ratio: 1 });
      const box = (await option.boundingBox())!;
      expect(box.y + 1, 'below the sticky header').toBeGreaterThanOrEqual(headerBottom.y + headerBottom.height - box.height + 1);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
}

test('print view of the doctor report: A4, black on white, a page per section, no controls', async ({ page }, info) => {
  await openScreen(page, SCREENS.find((s) => s.name === 'report-everything')!);
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  await expect(page.getByRole('button', { name: 'Save as PDF or print' })).toBeHidden();
  await expect(page.getByRole('checkbox', { name: 'Mood notes' })).toBeHidden();
  await expect(page.getByRole('link', { name: /Get help/ })).toBeHidden();
  const sections = page.locator('.report-section');
  expect(await sections.count()).toBeGreaterThanOrEqual(4);
  const style = await page.evaluate(() => {
    const [first, second] = [...document.querySelectorAll('.report-section')];
    return {
      first: getComputedStyle(first!).breakBefore,
      second: getComputedStyle(second!).breakBefore,
      body: getComputedStyle(document.body).backgroundColor,
      ink: getComputedStyle(document.querySelector('.report h2')!).color,
    };
  });
  expect(style).toEqual({ first: 'auto', second: 'page', body: 'rgb(255, 255, 255)', ink: 'rgb(0, 0, 0)' });
  await expect(page.getByText('Self-reported. A screening, not a diagnosis.')).toBeVisible();
  if (SHOTS && info.project.name === 'pixel') await page.screenshot({ path: `${SHOTS}/report-print.png`, fullPage: true });
});

test('print view of the safety plan keeps every step and number, and drops the controls', async ({ page }, info) => {
  await openScreen(page, SCREENS.find((s) => s.name === 'safety-plan')!);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('link', { name: 'Change your plan' })).toBeHidden();
  await expect(page.getByText('Call Didi, +91 98765 43210')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Step 7:/ })).toBeVisible();
  if (SHOTS && info.project.name === 'pixel') await page.screenshot({ path: `${SHOTS}/safety-plan-print.png`, fullPage: true });
});
