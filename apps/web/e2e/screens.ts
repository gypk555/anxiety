import { expect, type Page } from '@playwright/test';
import { A1, CHECKIN_KEY, GUEST_RESULT, J1, R1, REFLECTION_KEY, REFLECTION_RESULT, REFLECTION_RESULT_KEY, RESULT_KEY, mockApi, progress, reflectionProgress, seedSession, type MockOptions } from './fixtures';

export interface Screen {
  name: string;
  path: string;
  api?: MockOptions;
  seed?: (page: Page) => Promise<unknown>;
  /** Runs after load: open a sheet, start a session and so on. */
  act?: (page: Page) => Promise<unknown>;
  state?: Record<string, unknown>;
}

const signedIn: MockOptions = { signedIn: true };
const nulls = [null, null, null, null, null, null, null];
const result = (answers: number[], difficulty: number | null) => (page: Page) => seedSession(page, RESULT_KEY, GUEST_RESULT(answers, difficulty));
const REF_IDS = ['REF-001', 'REF-021', 'REF-041', 'REF-061', 'REF-081'];
const reflection = (answers: [string, number][]) => (page: Page) => seedSession(page, REFLECTION_RESULT_KEY, REFLECTION_RESULT(answers));

export const SCREENS: Screen[] = [
  { name: 'home-first-run', path: '/' },
  { name: 'checkin-choice', path: '/check-in' },
  { name: 'checkin-choice-account', path: '/check-in', api: signedIn },
  { name: 'checkin-intro', path: '/check-in/gad7' },
  { name: 'checkin-q1', path: '/check-in/1', seed: (p) => seedSession(p, CHECKIN_KEY, progress(nulls)) },
  { name: 'checkin-q2-long', path: '/check-in/5', seed: (p) => seedSession(p, CHECKIN_KEY, progress([1, 1, 1, 1, null, null, null])) },
  { name: 'checkin-q7', path: '/check-in/7', seed: (p) => seedSession(p, CHECKIN_KEY, progress([1, 2, 1, 2, 0, 1, null])) },
  { name: 'checkin-difficulty', path: '/check-in/difficulty', seed: (p) => seedSession(p, CHECKIN_KEY, progress([1, 2, 1, 2, 0, 1, 1])) },
  { name: 'result-minimal', path: '/result', seed: result([0, 1, 0, 0, 0, 1, 0], 0) },
  { name: 'result-mild', path: '/result', seed: result([1, 1, 1, 1, 1, 1, 1], 1) },
  { name: 'result-moderate', path: '/result', seed: result([2, 2, 2, 1, 1, 2, 2], 2) },
  { name: 'result-severe', path: '/result', seed: result([3, 3, 3, 2, 2, 3, 3], 3) },
  { name: 'result-save-offer', path: '/result', api: signedIn, seed: result([2, 2, 2, 1, 1, 2, 2], 2) },
  { name: 'result-saved', path: `/result/${A1}`, api: signedIn },
  { name: 'reflection-q1', path: '/reflection/1', seed: (p) => seedSession(p, REFLECTION_KEY, reflectionProgress(REF_IDS, [null, null, null, null, null])) },
  { name: 'reflection-q3-long', path: '/reflection/3', seed: (p) => seedSession(p, REFLECTION_KEY, reflectionProgress(['REF-013', 'REF-022', 'REF-055', 'REF-065', 'REF-094'], [1, 2, null, null, null])) },
  { name: 'reflection-note', path: '/reflection/note', seed: (p) => seedSession(p, REFLECTION_KEY, reflectionProgress(REF_IDS, [1, 2, 0, 2, 3])) },
  { name: 'reflection-result-quiet', path: '/reflection/result', seed: reflection([['REF-001', 1], ['REF-021', 0], ['REF-041', 1], ['REF-061', 1], ['REF-081', 0]]) },
  { name: 'reflection-result', path: '/reflection/result', seed: reflection([['REF-005', 2], ['REF-021', 3], ['REF-044', 2], ['REF-062', 2], ['REF-089', 3]]) },
  { name: 'reflection-result-help', path: '/reflection/result', seed: reflection([['REF-010', 3], ['REF-039', 2], ['REF-059', 2], ['REF-070', 0], ['REF-086', 0]]) },
  { name: 'reflection-save-offer', path: '/reflection/result', api: signedIn, seed: reflection([['REF-005', 2], ['REF-021', 3], ['REF-044', 1], ['REF-062', 2], ['REF-089', 3]]) },
  { name: 'reflection-saved', path: `/reflections/${R1}`, api: signedIn },
  { name: 'tools', path: '/tools' },
  { name: 'breathe-setup', path: '/tools/breathe' },
  {
    name: 'breathe-in',
    path: '/tools/breathe',
    act: async (p) => {
      await p.getByRole('button', { name: 'Begin' }).click();
      await p.waitForTimeout(6800); // lead-in, then near the top of the breath
    },
  },
  {
    name: 'breathe-out',
    path: '/tools/breathe',
    act: async (p) => {
      await p.getByRole('button', { name: 'Begin' }).click();
      await p.waitForTimeout(12400);
    },
  },
  { name: 'ground', path: '/tools/ground' },
  { name: 'sounds', path: '/tools/sounds' },
  { name: 'help', path: '/help' },
  { name: 'sign-in', path: '/sign-in' },
  { name: 'sign-in-why', path: '/sign-in?next=%2Fjournal' },
  {
    name: 'sign-in-code',
    path: '/sign-in',
    act: async (p) => {
      await p.getByLabel('Email address').fill('asha.menon@example.in');
      await p.getByRole('button', { name: 'Email me a code instead' }).click();
      await p.getByLabel('6-digit code').fill('123');
    },
  },
  { name: 'sign-in-google', path: '/sign-in', api: { googleEnabled: true } },
  { name: 'sign-in-google-failed', path: '/sign-in?error=google', api: { googleEnabled: true } },
  {
    name: 'sign-in-wrong-password',
    path: '/sign-in',
    api: { loginFails: true },
    act: async (p) => {
      await p.getByLabel('Email address').fill('asha.menon@example.in');
      await p.getByLabel('Password', { exact: true }).fill('not the right one');
      await p.getByRole('button', { name: 'Sign in' }).click();
      await p.getByRole('alert').waitFor();
    },
  },
  { name: 'create-account', path: '/create-account' },
  { name: 'create-account-google', path: '/create-account', api: { googleEnabled: true } },
  {
    name: 'create-account-password-problem',
    path: '/create-account',
    act: async (p) => {
      await p.getByLabel('Email address').fill('asha.menon@example.in');
      await p.getByLabel('Password', { exact: true }).fill('short');
      await p.getByRole('button', { name: 'Continue' }).click();
    },
  },
  {
    name: 'create-account-code',
    path: '/create-account',
    act: async (p) => {
      await p.getByLabel('Email address').fill('asha.menon@example.in');
      await p.getByLabel('Password', { exact: true }).fill('river stone quiet morning');
      await p.getByRole('button', { name: 'Continue' }).click();
      await p.getByLabel('6-digit code').fill('123');
    },
  },
  { name: 'forgot-password', path: '/forgot-password' },
  {
    name: 'forgot-password-reset',
    path: '/forgot-password',
    act: async (p) => {
      await p.getByLabel('Email address').fill('asha.menon@example.in');
      await p.getByRole('button', { name: 'Email me a code' }).click();
      await p.getByLabel('New password').fill('short');
      await p.getByRole('button', { name: 'Set new password' }).click();
    },
  },
  { name: 'consent', path: '/consent', api: { signedIn: true, consentRequired: true } },
  { name: 'consent-reprompt', path: '/consent', api: { signedIn: true, consentRequired: true, acceptedConsentVersion: '2000-01-01' } },
  { name: 'settings-consent-reprompt', path: '/settings', api: { signedIn: true, consentRequired: true, acceptedConsentVersion: '2000-01-01' } },
  { name: 'settings-consent-new', path: '/settings', api: { signedIn: true, consentRequired: true } },
  { name: 'settings-guest', path: '/settings' },
  { name: 'privacy', path: '/privacy' },
  { name: 'terms', path: '/terms' },
  { name: 'about', path: '/about' },
  { name: 'not-found', path: '/no-such-page' },
  { name: 'home-account', path: '/', api: signedIn },
  { name: 'home-account-empty', path: '/', api: { signedIn: true, empty: true } },
  { name: 'trends', path: '/trends', api: signedIn },
  { name: 'trends-table', path: '/trends', api: signedIn, act: (p) => p.getByRole('button', { name: 'Show these as a table' }).click() },
  { name: 'trends-empty', path: '/trends', api: { signedIn: true, empty: true } },
  { name: 'journal', path: '/journal', api: signedIn },
  { name: 'journal-empty', path: '/journal', api: { signedIn: true, empty: true } },
  { name: 'journal-detail', path: `/journal/${J1}`, api: signedIn },
  { name: 'journal-step1', path: '/journal/new', api: signedIn },
  { name: 'journal-step2', path: '/journal/new?step=2', api: signedIn },
  { name: 'journal-step3', path: '/journal/new?step=3', api: signedIn },
  { name: 'journal-step4', path: '/journal/new?step=4', api: signedIn },
  { name: 'journal-step5', path: '/journal/new?step=5', api: signedIn },
  {
    name: 'journal-discard',
    path: '/journal/new',
    api: signedIn,
    act: async (p) => {
      await p.getByRole('textbox').fill('At work, before a meeting.');
      await p.getByRole('button', { name: 'Close' }).click();
    },
  },
  { name: 'safety-plan-guest-empty', path: '/safety-plan' },
  { name: 'safety-plan-edit-guest', path: '/safety-plan/edit' },
  { name: 'safety-plan', path: '/safety-plan', api: signedIn },
  { name: 'safety-plan-empty', path: '/safety-plan', api: { signedIn: true, empty: true } },
  { name: 'safety-plan-edit', path: '/safety-plan/edit', api: signedIn },
  {
    name: 'safety-plan-delete',
    path: '/safety-plan',
    api: signedIn,
    act: (p) => p.getByRole('button', { name: 'Delete this plan' }).click(),
  },
  { name: 'mood-log', path: '/mood', api: signedIn },
  { name: 'mood-log-empty', path: '/mood', api: { signedIn: true, empty: true } },
  {
    name: 'mood-log-change-day',
    path: '/mood',
    api: signedIn,
    act: (p) => p.getByRole('button', { name: /^Change/ }).first().click(),
  },
  {
    name: 'mood-log-another-day',
    path: '/mood',
    api: signedIn,
    act: (p) => p.getByRole('button', { name: 'Log another day' }).click(),
  },
  {
    name: 'trends-mood-table',
    path: '/trends',
    api: signedIn,
    // Back to the top after opening it: scrolled, the sticky header covers part of the list, which axe counts as a small target.
    act: async (p) => {
      await p.getByRole('button', { name: 'Show the mood log as a table' }).click();
      await p.evaluate(() => window.scrollTo(0, 0));
    },
  },
  { name: 'report', path: '/report', api: signedIn },
  {
    name: 'report-everything',
    path: '/report',
    api: signedIn,
    act: async (p) => {
      for (const name of ['Mood notes', 'Safety plan', 'Journal entries', 'Reflections', 'Reflection notes', 'Put my name at the top']) await p.getByRole('checkbox', { name }).check();
      // Checking scrolls the page, and scrolled, the sticky header covers part of the form, which axe counts as a small target.
      await p.evaluate(() => window.scrollTo(0, 0));
    },
  },
  { name: 'report-empty', path: '/report', api: { signedIn: true, empty: true } },
  { name: 'settings-account', path: '/settings', api: signedIn },
  { name: 'settings-account-google', path: '/settings', api: { signedIn: true, googleEnabled: true, methods: { password: true, google: true } } },
  { name: 'settings-account-no-password', path: '/settings', api: { signedIn: true, googleEnabled: true, methods: { password: false, google: true } } },
  {
    name: 'settings-change-password',
    path: '/settings',
    api: signedIn,
    act: (p) => p.getByRole('button', { name: 'Change password' }).click(),
  },
  {
    name: 'settings-add-password',
    path: '/settings',
    api: { signedIn: true, methods: { password: false, google: false } },
    act: async (p) => {
      await p.getByRole('button', { name: 'Add a password' }).click();
      await p.getByRole('button', { name: 'Email me a code' }).click();
      await p.getByLabel('New password').waitFor();
    },
  },
  {
    name: 'settings-delete',
    path: '/settings',
    api: signedIn,
    act: (p) => p.getByRole('button', { name: 'Delete my account' }).click(),
  },
];

export async function openScreen(page: Page, screen: Screen) {
  await mockApi(page, screen.api);
  await screen.seed?.(page);
  await page.goto(screen.path);
  await expect(page.locator('h1').first()).toBeAttached();
  await page.waitForLoadState('networkidle');
  await screen.act?.(page);
  await page.waitForTimeout(250);
}
