import { signUp, expect, localDay, seedAssessment, seedJournal, seedMood, seedPlan, test } from './support';
import type { Page } from '@playwright/test';

const SIZE = { width: 568, height: 320 };

const cutOff = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const cut: string[] = [];
    if (document.documentElement.scrollWidth > width) cut.push(`page ${document.documentElement.scrollWidth}`);
    for (const el of document.querySelectorAll('main *, header *, nav *')) {
      if (el.closest('[aria-hidden="true"], .sr-only, .overflow-x-auto, dialog:not([open])')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > width + 1) cut.push(`${el.tagName} ${String(el.className).slice(0, 40)} ${Math.round(r.right)}`);
    }
    return cut;
  });

test('real signed-in screens fit a small phone on its side, with nothing cut off', async ({ page, context }) => {
  await signUp(page, 'landscape');
  const saved = await seedAssessment(context, [2, 2, 2, 2, 1, 1, 1], 2);
  const entry = await seedJournal(context);
  await seedMood(context, localDay(1), 3, 'Okay, all things considered.');
  await seedPlan(context, { helpContacts: [{ name: 'Didi', phone: '+91 98765 43210' }], reasonsToLive: ['My niece'] });
  await page.setViewportSize(SIZE);
  for (const path of ['/', '/help', '/tools', '/tools/sounds', '/tools/ground', '/trends', '/journal', `/journal/${entry.id}`, `/result/${saved.id}`, '/mood', '/safety-plan', '/safety-plan/edit', '/report', '/settings', '/privacy']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeAttached();
    await expect.poll(() => cutOff(page), { message: path }).toEqual([]);
  }
});

test('the breathing session fits, and Stop can be reached', async ({ page }) => {
  await page.setViewportSize(SIZE);
  await page.goto('/tools/breathe');
  await page.getByRole('button', { name: 'Begin' }).click();
  const stop = page.getByRole('button', { name: 'Stop' });
  await stop.scrollIntoViewIfNeeded();
  await expect(stop).toBeInViewport();
  await expect.poll(() => cutOff(page)).toEqual([]);
});
