import { CONSENT_VERSION, helplinesCheckNote, HELPLINES_CHECK_METHOD, HELPLINES_CHECKED_ON } from '@anxiocare/shared';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '@/lib/dates';
import { queryClient } from '@/lib/queries';
import { mockFetch, renderRoutes } from '@/test/render';
import { Help } from './Help';
import { About, Privacy } from './Legal';

const META = { operatorName: 'Op', grievanceEmail: 'g@example.com', consentVersion: CONSENT_VERSION, backupRetentionDays: 7, dataLocation: 'Mumbai', serverLocation: 'Singapore', mailProvider: 'Mailer Co' };
const page = (element: React.ReactNode) => renderRoutes([{ path: '/', element }, { path: '*', element: <p>other</p> }], '/', queryClient);

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('what the helpline date claims', () => {
  it('until someone phones, Help and About say published sources, and that no call has confirmed them', async () => {
    mockFetch({ 'GET /meta': { body: META } });
    expect(HELPLINES_CHECK_METHOD).toBe('published-sources');
    const line = helplinesCheckNote(HELPLINES_CHECK_METHOD, formatDate(HELPLINES_CHECKED_ON));
    expect(line).toMatch(/checked against published sources on 6 Nov 2026/);
    expect(line).toMatch(/not yet been confirmed by phone/);
    const help = page(<Help />);
    expect(screen.getByText((text) => text.includes(line))).toBeInTheDocument();
    expect(screen.queryByText(/last checked/i)).not.toBeInTheDocument();
    help.unmount();
    page(<About />);
    expect(screen.getByText((text) => text.includes(line))).toBeInTheDocument();
    expect(screen.queryByText(/last checked/i)).not.toBeInTheDocument();
  });

  it('once phoned, the same line says so, with no mention of published sources', () => {
    const line = helplinesCheckNote('phone', '3 Dec 2026');
    expect(line).toMatch(/confirmed by phone on 3 Dec 2026/);
    expect(line).not.toMatch(/published sources/);
  });
});

describe('About', () => {
  it('says the items and options are as published, and that the stem and lead-in are lightly adapted', () => {
    mockFetch({ 'GET /meta': { body: META } });
    page(<About />);
    expect(screen.getByText(/item and option wording is as published/i)).toBeInTheDocument();
    expect(screen.getByText(/stem and the lead-in to the difficulty question are lightly adapted/i)).toBeInTheDocument();
    expect(screen.getByText(/one question per screen/i)).toBeInTheDocument();
    expect(screen.queryByText(/in its published wording/)).not.toBeInTheDocument();
  });
});

describe('Privacy notice', () => {
  it('names Cloudflare among the providers', async () => {
    mockFetch({ 'GET /meta': { body: META } });
    page(<Privacy />);
    await screen.findByText(/handled by Mailer Co/);
    expect(screen.getByText(/Cloudflare/)).toBeInTheDocument();
  });

  it('names Cloudflare even offline, when the server-supplied details cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    page(<Privacy />);
    await screen.findByText(/exact locations and email provider load when you're connected/);
    expect(screen.getByText(/Cloudflare/)).toBeInTheDocument();
  });

  it('gives the timing the purge really keeps', () => {
    mockFetch({ 'GET /meta': { body: META } });
    page(<Privacy />);
    expect(screen.getByText(/For about an hour after we send you a code/)).toBeInTheDocument();
    expect(screen.getByText(/never agreed are deleted after 24 hours/)).toBeInTheDocument();
    expect(screen.queryByText(/removed within 24 hours/)).not.toBeInTheDocument();
  });

  it('says rights survive a changed notice', () => {
    mockFetch({ 'GET /meta': { body: META } });
    page(<Privacy />);
    expect(screen.getByText(/you can still download your data, delete your account or sign out without accepting/)).toBeInTheDocument();
  });
});
