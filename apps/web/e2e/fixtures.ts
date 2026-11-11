import { CONSENT_VERSION } from '@anxiocare/shared';
import type { Page } from '@playwright/test';

const USER_ID = '11111111-1111-4111-8111-111111111111';
export const A1 = '22222222-2222-4222-8222-222222222221';
export const J1 = '33333333-3333-4333-8333-333333333331';

export const me = (over: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: 'asha.menon@example.in',
  displayName: 'Asha',
  createdAt: '2026-08-01T04:00:00.000Z',
  consentRequired: false,
  consentVersion: CONSENT_VERSION,
  acceptedConsentVersion: over.consentRequired ? null : CONSENT_VERSION,
  ...over,
});

const assessment = (id: string, takenAt: string, answers: number[], difficulty: number | null) => {
  const score = answers.reduce((a, b) => a + b, 0);
  const severity = score <= 4 ? 'minimal' : score <= 9 ? 'mild' : score <= 14 ? 'moderate' : 'severe';
  return { id, takenAt, answers, difficulty, score, severity };
};

export const ASSESSMENTS = [
  assessment(A1, '2026-11-02T14:30:00.000Z', [2, 2, 1, 2, 1, 1, 1], 1),
  assessment('22222222-2222-4222-8222-222222222222', '2026-10-18T14:30:00.000Z', [2, 2, 2, 2, 1, 2, 2], 2),
  assessment('22222222-2222-4222-8222-222222222223', '2026-10-03T14:30:00.000Z', [3, 2, 3, 2, 2, 2, 2], 2),
  assessment('22222222-2222-4222-8222-222222222224', '2026-09-15T14:30:00.000Z', [2, 2, 1, 2, 1, 1, 2], 1),
  assessment('22222222-2222-4222-8222-222222222225', '2026-08-30T14:30:00.000Z', [1, 1, 1, 1, 0, 1, 1], 1),
];

export const ENTRIES = [
  {
    id: J1,
    situation: 'My manager asked to talk tomorrow and did not say what about.',
    thought: "I must have done something wrong. I'm going to lose my job.",
    feelings: ['Anxious', 'Scared'],
    intensityBefore: 8,
    evidenceFor: 'I missed one deadline last month.',
    evidenceAgainst: 'She praised the last two reports. We also talk about new work this way.',
    balancedThought: "I don't know what it's about yet. One missed deadline isn't the whole picture.",
    intensityAfter: 5,
    createdAt: '2026-11-03T16:00:00.000Z',
    updatedAt: '2026-11-03T16:00:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333332',
    situation: 'Family dinner, everyone asking about my plans.',
    thought: 'Everyone else has it figured out.',
    feelings: ['Overwhelmed'],
    intensityBefore: 6,
    evidenceFor: '',
    evidenceAgainst: '',
    balancedThought: '',
    intensityAfter: null,
    createdAt: '2026-10-22T16:00:00.000Z',
    updatedAt: '2026-10-22T16:00:00.000Z',
  },
];

export const SESSIONS = [
  { id: '44444444-4444-4444-8444-444444444441', deviceLabel: 'Chrome on Android', createdAt: '2026-10-01T04:00:00.000Z', lastSeenAt: '2026-11-07T04:00:00.000Z', current: true },
  { id: '44444444-4444-4444-8444-444444444442', deviceLabel: 'Safari on iPhone', createdAt: '2026-09-01T04:00:00.000Z', lastSeenAt: '2026-10-29T15:20:00.000Z', current: false },
];

const localDay = (daysAgo: number) => {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** A month of made-up mood days, with gaps, ending yesterday, so Home still asks about today. */
export const MOODS = [26, 24, 21, 19, 18, 15, 12, 10, 9, 7, 5, 4, 2, 1].map((ago, i) => ({
  day: localDay(ago),
  rating: [3, 2, 2, 3, 4, 3, 1, 2, 3, 4, 4, 3, 2, 3][i]!,
  note: ago === 4 ? 'Slept well for once. Walked to the market.' : ago === 12 ? 'Hard day at work.' : '',
  createdAt: '2026-11-01T04:00:00.000Z',
  updatedAt: '2026-11-01T04:00:00.000Z',
}));

export const R1 = '66666666-6666-4666-8666-666666666661';
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
export const REFLECTIONS = [
  { id: R1, takenAt: daysAgo(1), answers: [{ q: 'REF-005', a: 2 }, { q: 'REF-021', a: 3 }, { q: 'REF-044', a: 1 }, { q: 'REF-062', a: 2 }, { q: 'REF-089', a: 3 }], note: 'Exams next week. Chai with Meena helped.' },
  { id: '66666666-6666-4666-8666-666666666662', takenAt: daysAgo(6), answers: [{ q: 'REF-011', a: 3 }, { q: 'REF-036', a: 2 }, { q: 'REF-055', a: 2 }, { q: 'REF-070', a: 1 }, { q: 'REF-086', a: 1 }] },
];

export const PLAN = {
  warningSigns: ['Not sleeping, lying awake going over things', 'Staying in my room and not answering calls'],
  copingStrategies: ['Slow breathing, four in and six out', 'A cold glass of water, then a walk around the block'],
  distractions: ['Chai with Meena downstairs', 'The park near the temple'],
  helpContacts: [{ name: 'Didi', phone: '+91 98765 43210' }, { name: 'Rahul from college', phone: '98200 12345' }],
  professionals: [{ name: 'Dr Iyer at the clinic', phone: '(080) 2345-6789' }],
  saferSurroundings: ['Ask Didi to keep my tablets for now'],
  reasonsToLive: ['My niece, who calls me every Sunday', 'Seeing the monsoon come in again'],
  updatedAt: '2026-11-10T10:00:00.000Z',
};

export interface MockOptions {
  signedIn?: boolean;
  consentRequired?: boolean;
  /** With consentRequired: what they last accepted, which makes this a re-prompt. */
  acceptedConsentVersion?: string;
  empty?: boolean;
  googleEnabled?: boolean;
  methods?: { password: boolean; google: boolean };
  loginFails?: boolean;
}

const unauth = { type: 'about:blank', title: 'Unauthenticated', status: 401, code: 'unauthenticated' };

/** A stand-in for the API, from the shared contract, for visual and accessibility checks. */
export async function mockApi(page: Page, options: MockOptions = {}) {
  const { signedIn = false, consentRequired = false, empty = false, acceptedConsentVersion, googleEnabled = false, methods = { password: true, google: false }, loginFails = false } = options;
  const account = () => me({ consentRequired, ...(acceptedConsentVersion ? { acceptedConsentVersion } : {}) });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const method = route.request().method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: status >= 400 ? 'application/problem+json' : 'application/json', body: JSON.stringify(body) });

    if (path === '/meta') return json({ operatorName: 'AnxioCare Health LLP', grievanceEmail: 'grievance@anxiocare.example', consentVersion: CONSENT_VERSION, backupRetentionDays: 7, dataLocation: 'Mumbai, India', serverLocation: 'Singapore', mailProvider: 'our email provider', googleEnabled });
    if (method === 'POST' && path === '/auth/otp/request') return route.fulfill({ status: 202 });
    if (path === '/auth/otp/verify') return json(account());
    if (method === 'POST' && (path === '/auth/register/request' || path === '/auth/password/forgot')) return route.fulfill({ status: 202 });
    if (path === '/auth/login' && loginFails) return json({ type: 'about:blank', title: 'That email and password did not match', status: 400, code: 'invalid_credentials' }, 400);
    if (['/auth/login', '/auth/register/verify', '/auth/password/reset'].includes(path)) return json(account());
    if (!signedIn) return json(unauth, 401);
    if (path === '/me' && method === 'GET') return json(account());
    if (path === '/me/sign-in-methods') return json(methods);
    if (path === '/me/password/set/request') return route.fulfill({ status: 202 });
    if (path === '/auth/sessions') return json({ items: SESSIONS, nextCursor: null });
    if (path === '/assessments') return json({ items: empty ? [] : ASSESSMENTS, nextCursor: null });
    if (path.startsWith('/assessments/')) {
      const found = ASSESSMENTS.find((a) => path.endsWith(a.id));
      return found ? json(found) : json({ type: 'about:blank', title: 'Not found', status: 404, code: 'not_found' }, 404);
    }
    if (path === '/reflections' && method === 'GET') return json({ items: empty ? [] : REFLECTIONS, nextCursor: null });
    if (path === '/reflections' && method === 'POST') return json(REFLECTIONS[0], 201);
    if (path.startsWith('/reflections/')) {
      if (method !== 'GET') return route.fulfill({ status: 204 });
      const found = REFLECTIONS.find((r) => path.endsWith(r.id));
      return found ? json(found) : json({ type: 'about:blank', title: 'Not found', status: 404, code: 'not_found' }, 404);
    }
    if (path === '/moods') return json({ items: empty ? [] : MOODS });
    if (path.startsWith('/moods/')) return method === 'DELETE' ? route.fulfill({ status: 204 }) : json({ ...MOODS[0]!, day: path.slice(7) });
    if (path === '/safety-plan') {
      if (method === 'GET') return empty ? json({ type: 'about:blank', title: 'Not found', status: 404, code: 'not_found' }, 404) : json(PLAN);
      if (method === 'PUT') return json(PLAN);
      return route.fulfill({ status: 204 });
    }
    if (path === '/journal') return json({ items: empty ? [] : ENTRIES, nextCursor: null });
    if (path.startsWith('/journal/')) {
      const found = ENTRIES.find((e) => path.endsWith(e.id));
      return found ? json(found) : json({ type: 'about:blank', title: 'Not found', status: 404, code: 'not_found' }, 404);
    }
    return route.fulfill({ status: 204 });
  });
}

export const GUEST_RESULT = (answers: number[], difficulty: number | null) => ({
  clientRequestId: '55555555-5555-4555-8555-555555555555',
  answers,
  difficulty,
  takenAt: new Date().toISOString(),
});

export const seedSession = (page: Page, key: string, value: unknown) =>
  page.addInitScript(([k, v]) => sessionStorage.setItem(k as string, v as string), [key, JSON.stringify(value)]);

export const CHECKIN_KEY = 'anxiocare.checkin.v1';
export const RESULT_KEY = 'anxiocare.result.v1';
export const progress = (answers: (number | null)[], difficulty: number | null = null) => ({
  clientRequestId: '55555555-5555-4555-8555-555555555556',
  answers,
  difficulty,
});

export const REFLECTION_KEY = 'anxiocare.reflection.v1';
export const REFLECTION_RESULT_KEY = 'anxiocare.reflection-result.v1';
/** As the app stores them: ids and numbers only. A note is never in browser storage. */
export const reflectionProgress = (questionIds: string[], answers: (number | null)[]) => ({
  clientRequestId: '55555555-5555-4555-8555-555555555557',
  questionIds,
  answers,
});
export const REFLECTION_RESULT = (answers: [string, number][]) => ({
  clientRequestId: '55555555-5555-4555-8555-555555555558',
  answers: answers.map(([q, a]) => ({ q, a })),
  takenAt: new Date().toISOString(),
});
