import { CONSENT_VERSION } from '@anxiocare/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queries';
import { ME, mockFetch, renderRoutes } from '@/test/render';
import Settings from './Settings';

const META = { operatorName: 'Op', grievanceEmail: 'g@example.com', consentVersion: CONSENT_VERSION, backupRetentionDays: 7, dataLocation: 'Mumbai', serverLocation: 'Singapore', mailProvider: 'mail', googleEnabled: false };
const routes = [
  { path: '/settings', element: <Settings /> },
  { path: '/consent', element: <p>Consent page</p> },
  { path: '/', element: <p>Home page</p> },
];
const STALE = { ...ME, consentRequired: true, acceptedConsentVersion: '2000-01-01' };
const NEVER = { ...ME, consentRequired: true, acceptedConsentVersion: null };
const SESSIONS = { items: [] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  queryClient.clear();
});

describe('rights while consent is outstanding', () => {
  const open = (me: typeof STALE | typeof NEVER) => {
    const fetchMock = mockFetch({ 'GET /me': { body: me }, 'GET /auth/sessions': { body: SESSIONS }, 'GET /me/sign-in-methods': { body: { password: true, google: false } }, 'GET /meta': { body: META } });
    return { ...renderRoutes(routes, '/settings', queryClient), fetchMock };
  };

  it.each([['out of date', STALE], ['never given', NEVER]])('%s: sign out, download and delete are all there, without accepting', async (_label, me) => {
    open(me);
    expect(await screen.findByRole('button', { name: 'Sign out', exact: true } as never)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download my data' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeInTheDocument();
    expect(screen.getByText(me.email)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review and agree' })).toHaveAttribute('href', '/consent?next=%2Fsettings');
  });

  it('deleting all check-ins and clearing profile details are rights too, without accepting', async () => {
    const user = userEvent.setup();
    let profile: object = { avatar: 'leaf', gender: 'woman' };
    const { calls } = mockFetch({
      'GET /me': () => ({ body: { ...STALE, profile } }),
      'DELETE /me/profile': () => {
        profile = {};
        return { body: { ...STALE, profile } };
      },
      'GET /assessments': { body: { items: [], nextCursor: null } },
      'GET /auth/sessions': { body: SESSIONS }, 'GET /me/sign-in-methods': { body: { password: true, google: false } }, 'GET /meta': { body: META },
    });
    renderRoutes(routes, '/settings', queryClient);
    expect(await screen.findByRole('button', { name: 'Delete all check-ins' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear my profile details' }));
    const confirm = await screen.findByRole('dialog', { name: 'Clear your profile details?' });
    await user.click(within(confirm).getByRole('button', { name: 'Clear details' }));
    expect(await screen.findByText('Profile details cleared')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'DELETE /me/profile')).toBe(true);
    expect(calls.some((c) => c.key === 'PATCH /me/profile')).toBe(false);
  });

  it('holds back only what the server refuses until consent: changing the name and email', async () => {
    open(STALE);
    await screen.findByRole('button', { name: 'Download my data' });
    expect(screen.queryByRole('button', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Email' })).not.toBeInTheDocument();
    expect(screen.getByText(STALE.email)).toBeInTheDocument();
  });

  it('a re-prompt says the data is kept; a new account says it goes after 24 hours', async () => {
    const first = open(STALE);
    expect(await screen.findByText(/Your data is kept/)).toBeInTheDocument();
    expect(screen.queryByText(/after 24 hours/)).not.toBeInTheDocument();
    first.unmount();
    queryClient.clear();
    open(NEVER);
    expect(await screen.findByText(/deleted after 24 hours/)).toBeInTheDocument();
    expect(screen.queryByText(/Your data is kept/)).not.toBeInTheDocument();
  });

  it('a consented account sees no prompt', async () => {
    mockFetch({ 'GET /me': { body: ME }, 'GET /auth/sessions': { body: SESSIONS }, 'GET /me/sign-in-methods': { body: { password: true, google: false } }, 'GET /meta': { body: META } });
    renderRoutes(routes, '/settings', queryClient);
    await screen.findByRole('button', { name: 'Download my data' });
    expect(screen.queryByRole('link', { name: 'Review and agree' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Name' })).toHaveAccessibleDescription('Asha Used to greet you');
    expect(screen.getByRole('button', { name: 'Email' })).toHaveAccessibleDescription(ME.email);
  });

  it('the last control on the page is deleting the account, after signing out', async () => {
    mockFetch({ 'GET /me': { body: ME }, 'GET /auth/sessions': { body: SESSIONS }, 'GET /me/sign-in-methods': { body: { password: true, google: false } }, 'GET /meta': { body: META } });
    renderRoutes(routes, '/settings', queryClient);
    await screen.findByRole('button', { name: 'Download my data' });
    const controls = [...document.querySelectorAll<HTMLElement>('a[href], button')].filter((b) => !b.closest('dialog'));
    expect(controls.at(-1)).toHaveAccessibleName('Delete my account');
    expect(controls.at(-2)).toHaveAccessibleName('Sign out on all devices');
  });

  it('says out loud when the download starts', async () => {
    mockFetch({ 'GET /me': { body: ME }, 'GET /auth/sessions': { body: SESSIONS }, 'GET /me/sign-in-methods': { body: { password: true, google: false } }, 'GET /meta': { body: META }, 'GET /me/export': { body: { me: 1 } } });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderRoutes(routes, '/settings', queryClient);
    await userEvent.click(await screen.findByRole('button', { name: 'Download my data' }));
    const said = await screen.findByText('Download started.', { selector: '[aria-live] *, [aria-live]' });
    expect(said).toBeInTheDocument();
  });

  it('the delete group can be found by its heading', async () => {
    mockFetch({ 'GET /me': { body: ME }, 'GET /auth/sessions': { body: SESSIONS }, 'GET /me/sign-in-methods': { body: { password: true, google: false } }, 'GET /meta': { body: META } });
    renderRoutes(routes, '/settings', queryClient);
    expect(await screen.findByRole('region', { name: 'Delete your account' })).toContainElement(screen.getByRole('button', { name: 'Delete my account' }));
  });

  it('changes the name in a sheet, and the row shows the new one', async () => {
    let name: string | null = 'Asha';
    const { calls } = mockFetch({
      'GET /me': () => ({ body: { ...ME, displayName: name } }),
      'PATCH /me': (body) => { name = (body as { displayName: string | null }).displayName; return { body: { ...ME, displayName: name } }; },
      'GET /auth/sessions': { body: SESSIONS }, 'GET /me/sign-in-methods': { body: { password: true, google: false } }, 'GET /meta': { body: META },
    });
    renderRoutes(routes, '/settings', queryClient);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Name' }));
    const sheet = await screen.findByRole('dialog', { name: 'Your name' });
    const field = within(sheet).getByLabelText('Your name or a nickname');
    await user.clear(field);
    await user.type(field, 'Meera');
    await user.click(within(sheet).getByRole('button', { name: 'Save name' }));
    expect(calls.find((c) => c.key === 'PATCH /me')?.body).toEqual({ displayName: 'Meera' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Name' })).toHaveAccessibleDescription('Meera Used to greet you'));
    expect(await screen.findByText('Name saved')).toBeInTheDocument();
  });
});

describe('the name in Settings', () => {
  it('can be changed but not removed', async () => {
    const { calls } = mockFetch({
      'GET /me': { body: ME }, 'PATCH /me': { body: ME },
      'GET /auth/sessions': { body: SESSIONS }, 'GET /me/sign-in-methods': { body: { password: true, google: false } }, 'GET /meta': { body: META },
    });
    renderRoutes(routes, '/settings', queryClient);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Name' }));
    const sheet = await screen.findByRole('dialog', { name: 'Your name' });
    const field = within(sheet).getByLabelText('Your name or a nickname');
    expect(field).toBeRequired();
    expect(field).toHaveValue('Asha');
    await user.clear(field);
    await user.click(within(sheet).getByRole('button', { name: 'Save name' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Enter your name or a nickname.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveFocus();
    expect(calls.some((c) => c.key === 'PATCH /me')).toBe(false);
    expect(within(sheet).queryByRole('button', { name: /Remove|Clear/ })).not.toBeInTheDocument();
  });
});

describe('About you in Settings', () => {
  const open = (profile: object, extra: Record<string, unknown> = {}) => {
    let me = { ...ME, profile };
    const mocks = mockFetch({
      'GET /me': () => ({ body: me }),
      'PATCH /me/profile': (body) => {
        const next: Record<string, unknown> = { ...me.profile };
        for (const [k, v] of Object.entries(body as object)) {
          if (v === null || (Array.isArray(v) && v.length === 0)) delete next[k];
          else next[k] = v;
        }
        me = { ...me, profile: next };
        return { body: me };
      },
      'GET /auth/sessions': { body: SESSIONS }, 'GET /me/sign-in-methods': { body: { password: true, google: false } }, 'GET /meta': { body: META },
      ...extra,
    });
    renderRoutes(routes, '/settings', queryClient);
    return mocks;
  };

  it('shows the avatar in the profile card, and every detail can be changed or cleared', async () => {
    const user = userEvent.setup();
    const { calls } = open({ avatar: 'ocean', gender: 'woman', stressFactors: ['work'] });
    expect(await screen.findByRole('img', { name: 'Ocean Breeze' })).toBeInTheDocument();
    const row = screen.getByRole('button', { name: 'About you' });
    expect(row).toHaveAccessibleDescription(/Woman/);
    await user.click(row);
    const sheet = await screen.findByRole('dialog', { name: 'About you' });
    expect(within(within(sheet).getByRole('radiogroup', { name: 'Gender' })).getByRole('radio', { name: 'Woman' })).toBeChecked();
    await user.click(within(within(sheet).getByRole('radiogroup', { name: 'Gender' })).getByRole('radio', { name: 'Not set' }));
    await user.click(within(within(sheet).getByRole('radiogroup', { name: 'Avatar' })).getByRole('radio', { name: 'Your initial' }));
    await user.click(within(sheet).getByRole('checkbox', { name: 'Work' }));
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(calls.find((c) => c.key === 'PATCH /me/profile')!.body).toEqual({ avatar: null, ageRange: null, gender: null, occupation: null, stressFactors: [] });
    expect(await screen.findByText('Details saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Ocean Breeze' })).not.toBeInTheDocument());
  });

  it('Delete all check-ins names the count, and asks to confirm it is you first', async () => {
    const user = userEvent.setup();
    let fresh = false;
    const { calls } = open({}, {
      'GET /assessments': { body: { items: [{}, {}, {}].map((_, i) => ({ id: `22222222-2222-4222-8222-22222222222${i}`, takenAt: '2026-11-01T04:00:00.000Z', answers: [1, 1, 1, 1, 1, 1, 1], difficulty: 1, score: 7, severity: 'mild' })), nextCursor: null } },
      'DELETE /assessments': () => (fresh ? { body: { deleted: 3 } } : { status: 403, body: { type: 'about:blank', title: 'x', status: 403, code: 'reauth_required' } }),
      'POST /me/reauth/password': () => {
        fresh = true;
        return { status: 204 };
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Delete all check-ins' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete all check-ins?' });
    expect(confirm).toHaveTextContent('All 3 of your saved check-ins will be deleted');
    await user.click(within(confirm).getByRole('button', { name: 'Delete 3 check-ins' }));
    const reauth = await screen.findByRole('dialog', { name: "Confirm it's you" });
    await user.type(within(reauth).getByLabelText('Your password'), 'river stone quiet morning');
    await user.click(within(reauth).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('3 check-ins deleted')).toBeInTheDocument();
    expect(calls.filter((c) => c.key === 'DELETE /assessments')).toHaveLength(2);
  });
});

describe('offline on a fresh load', () => {
  it('says why the account section is missing, and offers to try again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    renderRoutes(routes, '/settings', queryClient);
    expect(await screen.findByRole('heading', { name: "We can't load your account" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/download or delete your data/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "You're not signed in" })).not.toBeInTheDocument();
  });
});

describe('sending a new code from a sheet', () => {
  const open = () => {
    const fetchMock = mockFetch({
      'GET /me': { body: ME },
      'GET /auth/sessions': { body: SESSIONS }, 'GET /me/sign-in-methods': { body: { password: true, google: false } },
      'GET /meta': { body: META },
      'POST /me/delete/request': { status: 202 },
      'POST /me/email/request': { status: 202 },
    });
    renderRoutes(routes, '/settings', queryClient);
    return fetchMock;
  };
  const count = (fetchMock: ReturnType<typeof open>, key: string) => fetchMock.calls.filter((c) => c.key === key).length;
  const user = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  const waitOutCooldown = async () => {
    for (let i = 0; i < 46; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
  };
  const fake = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'], shouldAdvanceTime: true });

  it('delete: waits out the cooldown, then sends another code and says so', async () => {
    fake();
    const u = user();
    const fetchMock = open();
    await u.click(await screen.findByRole('button', { name: 'Delete my account' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Delete your account?', hidden: true }));
    await u.click(sheet.getByRole('button', { name: 'Email me a code', hidden: true }));
    const resend = await sheet.findByRole('button', { name: /Send a new code in \d+s/, hidden: true });
    expect(resend).toBeDisabled();
    await waitOutCooldown();
    await u.click(sheet.getByRole('button', { name: 'Send a new code', hidden: true }));
    await waitFor(() => expect(count(fetchMock, 'POST /me/delete/request')).toBe(2));
    expect(await sheet.findByText('New code sent. Use the latest one.')).toBeInTheDocument();
    expect(sheet.getByRole('button', { name: /Send a new code in \d+s/, hidden: true })).toBeDisabled();
  });

  it('email change: resends to both inboxes, for the same new address', async () => {
    fake();
    const u = user();
    const fetchMock = open();
    await u.click(await screen.findByRole('button', { name: 'Email' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Change your email', hidden: true }));
    await u.type(sheet.getByLabelText('New email address'), 'new@example.com');
    await u.click(sheet.getByRole('button', { name: 'Send codes', hidden: true }));
    await sheet.findByRole('button', { name: /Send new codes in \d+s/, hidden: true });
    await waitOutCooldown();
    await u.click(sheet.getByRole('button', { name: 'Send new codes', hidden: true }));
    await waitFor(() => expect(count(fetchMock, 'POST /me/email/request')).toBe(2));
    expect(fetchMock.calls.filter((c) => c.key === 'POST /me/email/request').at(-1)!.body).toEqual({ newEmail: 'new@example.com' });
    expect(await sheet.findByText('New codes sent. Use the latest one from each inbox.')).toBeInTheDocument();
  });
});

describe('theme options', () => {
  const open = async () => {
    mockFetch({ 'GET /me': { status: 401, body: {} }, 'GET /meta': { body: META } });
    renderRoutes(routes, '/settings', queryClient);
    return screen.findAllByRole('radio');
  };

  it('are short enough to sit on one line: Phone, Light, Dark', async () => {
    const radios = await open();
    expect(radios.map((r) => r.textContent)).toEqual(['Phone', 'Light', 'Dark']);
  });

  it('are one Tab stop, on the chosen option', async () => {
    const radios = await open();
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    expect(radios.find((r) => r.tabIndex === 0)).toHaveAttribute('aria-checked', 'true');
  });

  it('arrow keys move and choose, wrapping at the ends', async () => {
    const radios = await open();
    const start = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true');
    radios[start]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    const next = radios[(start + 1) % 3]!;
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    const back = radios[(start + 2) % 3]!;
    expect(back).toHaveFocus();
    expect(back).toHaveAttribute('aria-checked', 'true');
  });
});
