import { GAD7_ITEMS, GAD7_OPTIONS, REFLECTION_OPTIONS, REFLECTION_QUESTIONS, scoreGad7, type ReflectionQuestion } from '@anxiocare/shared';
import type { Page } from '@playwright/test';
import {
  answerDifficulty,
  answerItems,
  api,
  expect,
  expectAccessible,
  expectNoOverflowAt320,
  resultHeading,
  seedReflection,
  signUp,
  test,
} from './support';

/** Reflections through the real app: the chooser, the bank, the result, and saving. See docs/modules/reflections.md. */

const byText = new Map(REFLECTION_QUESTIONS.map((q) => [q.text, q]));
const HELP = REFLECTION_QUESTIONS.find((q) => q.bringsHelp && q.theme === 'worry')!;

/** Answers the five questions on screen in turn, then the note. Returns the questions, as asked. */
async function answerReflection(page: Page, values: readonly number[], note = ''): Promise<ReflectionQuestion[]> {
  const asked: ReflectionQuestion[] = [];
  for (let i = 0; i < values.length; i += 1) {
    await expect(page).toHaveURL(new RegExp(`/reflection/${i + 1}$`));
    const heading = page.getByRole('heading', { level: 1 });
    // The screen changes just after the address does, and the first one loads its chunk: wait for a new question.
    const current = async () => {
      const q = byText.get((await heading.textContent()) ?? '');
      return q && !asked.some((a) => a.id === q.id) ? q : undefined;
    };
    await expect.poll(async () => (await current())?.id, { message: `question ${i + 1} is from the bank` }).toBeDefined();
    asked.push((await current())!);
    await page.getByRole('button', { name: REFLECTION_OPTIONS[values[i]!]!.label, exact: true }).click();
  }
  await expect(page).toHaveURL(/\/reflection\/note$/);
  if (note) await page.getByLabel('Anything else on your mind? (optional)').fill(note);
  await page.getByRole('button', { name: 'See your reflection' }).click();
  return asked;
}

async function startReflection(page: Page) {
  await page.goto('/check-in');
  await expect(page.getByRole('heading', { level: 1, name: 'What would you like to do?' })).toBeVisible();
  await page.getByRole('button', { name: /^Reflection/ }).click();
}

/** A reflection made of these questions, as if picked: for the questions that bring Get help forward. */
async function seedProgress(page: Page, ids: string[]) {
  await page.goto('/about');
  // Let the service worker's registration finish first: WebKit reports a cancelled one as an uncaught error.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()) !== undefined), { timeout: 15_000 })
    .toBe(true);
  await page.evaluate((questionIds) => {
    sessionStorage.setItem('anxiocare.reflection.v1', JSON.stringify({ clientRequestId: crypto.randomUUID(), questionIds, answers: questionIds.map(() => null), note: '' }));
  }, ids);
  await page.goto('/reflection/1');
}

test('the start of a check-in offers both, with Get help and Quick exit still there', async ({ page }) => {
  // Home offers both, each one tap away.
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('link', { name: /Anxiety check \(GAD-7\)/ })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: /^Reflection/ })).toBeVisible();
  // So does the chooser, which the account's check-ins and Trends link to.
  await page.goto('/check-in');
  await expect(page.getByRole('heading', { level: 1, name: 'What would you like to do?' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Anxiety check \(GAD-7\)/ })).toContainText('7 questions, the same each time.');
  await expect(page.getByRole('button', { name: /^Reflection/ })).toContainText('No score.');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Get help' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Quick exit' })).toBeVisible();
});

test('the GAD-7 path is as it was: the same seven questions in order, scored', async ({ page }) => {
  await page.goto('/check-in');
  await page.getByRole('link', { name: /Anxiety check \(GAD-7\)/ }).click();
  await expect(page).toHaveURL(/\/check-in\/gad7$/);
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page).toHaveURL(/\/check-in\/1$/);
  for (const option of GAD7_OPTIONS) await expect(page.getByRole('button', { name: option.label, exact: true })).toBeVisible();
  const answers = [1, 2, 0, 1, 1, 0, 2];
  await answerItems(page, answers);
  expect(GAD7_ITEMS).toHaveLength(7);
  await answerDifficulty(page, 1);
  await expect(page).toHaveURL(/\/result$/);
  await expect(resultHeading(page)).toContainText(`${scoreGad7(answers)} out of 21`);
});

test('a guest chooses Reflection, answers five questions one per theme, and sees an unscored result', async ({ page }) => {
  await startReflection(page);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Get help' })).toBeVisible();
  const asked = await answerReflection(page, [2, 3, 0, 2, 0], 'Exams next week');
  expect(asked.map((q) => q.theme)).toEqual(['worry', 'body', 'situations', 'coping', 'connection']);
  await expect(page).toHaveURL(/\/reflection\/result$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Your reflection' })).toBeVisible();
  await expect(page.getByText('Worry and how your body felt came up today.')).toBeVisible();
  await expect(page.getByText('This is a reflection, not a test or a diagnosis.')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(/out of 21|score|Minimal|Mild|Moderate|Severe/);
  for (const q of asked) await expect(page.getByRole('list', { name: 'Your answers' })).toContainText(q.text);
  await expect(page.getByText('Exams next week')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to save' })).toBeVisible();
  // Ids and numbers in the tab, never the wording.
  const stored = await page.evaluate(() => JSON.stringify({ ...sessionStorage }));
  for (const q of asked) expect(stored).not.toContain(q.text);
  expect(stored).not.toContain('Exams next week');
  expect(await page.evaluate(() => localStorage.getItem('anxiocare.reflection-result.v1'))).toBeNull();
});

test('an answer of "Quite a bit" to a question that brings help brings Get help forward', async ({ page }) => {
  await seedProgress(page, [HELP.id, 'REF-021', 'REF-041', 'REF-061', 'REF-081']);
  await answerReflection(page, [2, 0, 0, 0, 0]);
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Support is here if you want it' }) });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: /^Call / })).toHaveAttribute('href', /^tel:/);
  await expect(panel.getByRole('link', { name: 'Open your safety plan' })).toHaveAttribute('href', '/safety-plan');
  await expectAccessible(page, 'reflection result with help');
  await expectNoOverflowAt320(page, 'reflection result with help');
});

test('a second reflection uses different questions from the first', async ({ page }) => {
  await startReflection(page);
  const first = await answerReflection(page, [1, 1, 1, 1, 1]);
  await expect(page).toHaveURL(/\/reflection\/result$/);
  await startReflection(page);
  const second = await answerReflection(page, [1, 1, 1, 1, 1]);
  expect(second.filter((q) => first.some((f) => f.id === q.id))).toEqual([]);
});

test('signed in: saves automatically, appears in history with a Reflection label, opens to its answers, and goes in the report', async ({ page, context }) => {
  await signUp(page, 'reflect');
  const earlier = await seedReflection(context, [['REF-001', 3], ['REF-021', 3], ['REF-041', 0], ['REF-061', 0], ['REF-081', 0]], 'An earlier note');
  await startReflection(page);
  const asked = await answerReflection(page, [3, 2, 1, 0, 2], 'SavedReflectionNote');
  for (const q of asked) expect(earlier.answers.map((a) => a.q)).not.toContain(q.id);
  await expect(page).toHaveURL(/\/reflections\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Your reflection' })).toBeVisible();
  await expect(page.getByText('SavedReflectionNote')).toBeVisible();
  const saved = (await (await api(context).get('/reflections')).json()) as { items: { id: string; answers: { q: string; a: number }[]; note?: string }[] };
  expect(saved.items).toHaveLength(2);
  expect(saved.items[0]!.answers).toEqual(asked.map((q, i) => ({ q: q.id, a: [3, 2, 1, 0, 2][i] })));
  await expectAccessible(page, 'saved reflection');
  await expectNoOverflowAt320(page, 'saved reflection');

  await page.goto('/trends');
  const section = page.getByRole('region', { name: 'Reflections' });
  await expect(section.getByRole('link', { name: /^Reflection/ })).toHaveCount(2);
  await expect(section.getByRole('img')).toHaveCount(0);
  await expect(section).toContainText('A count, not a score');
  await section.getByRole('link', { name: /^Reflection/ }).last().click();
  await expect(page).toHaveURL(new RegExp(`/reflections/${earlier.id}$`));
  await expect(page.getByRole('list', { name: 'Your answers' })).toContainText(REFLECTION_QUESTIONS[0]!.text);
  await expectAccessible(page, 'reflection from history');

  await page.goto('/report');
  const preview = page.getByRole('region', { name: 'Report preview' });
  await expect(preview).not.toContainText(asked[0]!.text);
  await page.getByRole('checkbox', { name: 'Reflections' }).check();
  await expect(preview).toContainText(asked[0]!.text);
  await expect(preview).not.toContainText('SavedReflectionNote');
  await page.getByRole('checkbox', { name: 'Reflection notes' }).check();
  await expect(preview).toContainText('SavedReflectionNote');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectAccessible(page, 'report with reflections');
  await expectNoOverflowAt320(page, 'report with reflections');

  await page.goto(`/reflections/${earlier.id}`);
  await page.getByRole('button', { name: 'Delete this reflection' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete reflection' }).click();
  await expect(page).toHaveURL(/\/trends$/);
  await expect(page.getByRole('region', { name: 'Reflections' }).getByRole('link', { name: /^Reflection/ })).toHaveCount(1);
});

test('a guest reflection can be saved after signing in, through Home', async ({ page, context }) => {
  await startReflection(page);
  const asked = await answerReflection(page, [1, 0, 2, 3, 1], 'GuestNote');
  // The note is in memory only, so the page loads of signing in here lose it: a browser never stores it.
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain('GuestNote');
  await expect(page.getByRole('link', { name: 'Sign in to save' })).toBeVisible();
  await signUp(page, 'reflect-guest');
  await page.getByRole('link', { name: /Your reflection is still here/ }).click();
  await page.getByRole('button', { name: 'Save reflection' }).click();
  await expect(page).toHaveURL(/\/reflections\/[0-9a-f-]{36}$/);
  const saved = (await (await api(context).get('/reflections')).json()) as { items: { answers: { q: string; a: number }[]; note?: string }[] };
  expect(saved.items).toEqual([{ id: expect.any(String), takenAt: expect.any(String), answers: asked.map((q, i) => ({ q: q.id, a: [1, 0, 2, 3, 1][i] })) }]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe and 320px on every reflection screen, ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    for (const path of ['/check-in', '/check-in/gad7']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page, path);
      await expectNoOverflowAt320(page, path);
    }
    await seedProgress(page, ['REF-013', 'REF-022', 'REF-055', 'REF-080', 'REF-094']);
    for (let i = 0; i < 5; i += 1) {
      await expect(page).toHaveURL(new RegExp(`/reflection/${i + 1}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page, `reflection question ${i + 1}`);
      await expectNoOverflowAt320(page, `reflection question ${i + 1}`);
      await page.getByRole('button', { name: 'Quite a bit', exact: true }).click();
    }
    await expect(page.getByLabel('Anything else on your mind? (optional)')).toBeVisible();
    await expectAccessible(page, 'reflection note');
    await expectNoOverflowAt320(page, 'reflection note');
    await page.getByRole('button', { name: 'See your reflection' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your reflection' })).toBeVisible();
    await expectAccessible(page, 'guest reflection result');
    await expectNoOverflowAt320(page, 'guest reflection result');
  });
}
