import {
  CONTACT_NAME_MAX,
  CONTACT_PHONE_MAX,
  EMERGENCY_NUMBER,
  emptySafetyPlan,
  HELPLINES,
  isPlanEmpty,
  SAFETY_PLAN_ITEM_MAX,
  SAFETY_PLAN_MAX_ITEMS,
  SAFETY_PLAN_SECTIONS,
  safetyPlanBody,
  type Me,
  type PlanContact,
  type PlanSection,
  type SafetyPlan,
} from '@anxiocare/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Plus, Printer, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { errorMessage, NetworkError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { withNext } from '@/lib/next-path';
import { useMe } from '@/lib/queries';
import { isExiting } from '@/lib/quick-exit';
import { deletePlan, fetchPlan, planKey, putPlan, telHref, tidyPlan } from '@/lib/safety-plan';
import { clearAccountCopy, deleteDevicePlan, loadDevicePlan, saveDevicePlan } from '@/lib/vault';
import { PageTitle } from '@/ui/PageTitle';
import { ConfirmSheet } from '@/ui/Sheet';
import { ErrorState, PageSkeleton } from '@/ui/States';

/**
 * A personal safety plan, after the Stanley-Brown safety plan. Written in calm times, read in hard ones, so the view is
 * plain and large. Wording needs clinician review: docs/CLINICAL-SAFETY.md. Behaviour: docs/modules/safety-plan.md.
 */

type Source =
  | { mode: 'loading' }
  | { mode: 'consent' }
  | { mode: 'error'; error: unknown; retry: () => void }
  /** Signed in and online: the server's plan. */
  | { mode: 'account'; me: Me; plan: SafetyPlan | null }
  /** Signed in, or was, but no connection: the device copy, read-only. */
  | { mode: 'offline'; plan: SafetyPlan | null; savedAt: string | null }
  /** No account: the device copy is the plan. */
  | { mode: 'guest'; plan: SafetyPlan | null };

const deviceKey = ['device-plan'] as const;

function usePlanSource(): Source {
  const client = useQueryClient();
  const me = useMe();
  const signedIn = !!me.data && !me.data.consentRequired;
  const server = useQuery({ queryKey: planKey, queryFn: fetchPlan, enabled: signedIn, retry: false });
  const serverOffline = server.error instanceof NetworkError;
  const meOffline = me.isError && me.data === undefined && me.error instanceof NetworkError;
  const guest = me.isSuccess && me.data === null;

  const device = useQuery({
    queryKey: [...deviceKey, guest ? 'guest' : serverOffline ? `account:${me.data?.id}` : meOffline ? 'offline' : 'none'],
    enabled: guest || serverOffline || meOffline,
    queryFn: async () => {
      if (guest) return loadDevicePlan({ kind: 'guest' });
      if (serverOffline) return loadDevicePlan({ kind: 'account', userId: me.data!.id });
      // Reloaded with no connection, so nobody can say who is signed in: the last signed-in copy, or a guest plan.
      const account = await loadDevicePlan({ kind: 'account' });
      if (account) return account;
      const guestPlan = await loadDevicePlan({ kind: 'guest' });
      return guestPlan && { ...guestPlan, guest: true as const };
    },
    staleTime: 0,
  });

  // After one load, the plan opens offline: an encrypted copy follows what the server says.
  const userId = me.data?.id;
  const serverPlan = server.data;
  useEffect(() => {
    if (!userId || serverPlan === undefined) return;
    if (serverPlan) {
      const { updatedAt: _u, ...plan } = serverPlan;
      void saveDevicePlan({ kind: 'account', userId }, plan).catch(() => {});
    } else void clearAccountCopy();
  }, [userId, serverPlan, client]);

  if (me.isPending) return { mode: 'loading' };
  if (me.data?.consentRequired) return { mode: 'consent' };
  if (meOffline || serverOffline) {
    if (device.isPending) return { mode: 'loading' };
    // A plan kept only on this device needs no connection to change or delete.
    if (device.data && 'guest' in device.data) return { mode: 'guest', plan: device.data.plan };
    return { mode: 'offline', plan: device.data?.plan ?? null, savedAt: device.data?.savedAt ?? null };
  }
  if (me.isError) return { mode: 'error', error: me.error, retry: () => void me.refetch() };
  if (guest) {
    if (device.isPending) return { mode: 'loading' };
    return { mode: 'guest', plan: device.data?.plan ?? null };
  }
  if (server.isPending) return { mode: 'loading' };
  if (server.isError) return { mode: 'error', error: server.error, retry: () => void server.refetch() };
  const { updatedAt: _u, ...plan } = server.data ?? { updatedAt: '' };
  return { mode: 'account', me: me.data!, plan: server.data ? (plan as SafetyPlan) : null };
}

// ── Viewing ──────────────────────────────────────────────────────────

export function SafetyPlanView() {
  const source = usePlanSource();
  if (source.mode === 'consent') return <Navigate to={withNext('/consent', '/safety-plan')} replace />;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle className="pt-2 text-3xl" title="Your safety plan">Your safety plan</PageTitle>
        <p className="no-print mt-1 text-ink-soft">For hard moments: what helps, and who to call. Written by you, in your own words.</p>
      </div>
      {source.mode === 'loading' && <PageSkeleton />}
      {source.mode === 'error' && <ErrorState error={source.error} onRetry={source.retry} />}
      {source.mode === 'account' && <GuestPlanOffer me={source.me} accountHasPlan={!!source.plan && !isPlanEmpty(source.plan)} />}
      {(source.mode === 'account' || source.mode === 'guest' || source.mode === 'offline') && <PlanBody source={source} />}
    </div>
  );
}

function DeviceNote({ source }: { source: Extract<Source, { mode: 'account' | 'guest' | 'offline' }> }) {
  if (source.mode === 'offline') {
    return (
      <p role="status" className="no-print patch text-sm">
        {source.plan
          ? `You're offline. This is the copy saved on this device${source.savedAt ? ` on ${formatDateTime(source.savedAt)}` : ''}. Changes need a connection.`
          : "You're offline, and no safety plan is saved on this device. The helplines below still work."}
      </p>
    );
  }
  if (source.mode === 'guest') return <p className="no-print text-sm text-ink-soft">Without an account, your plan is kept only on this device, encrypted. Anyone who uses this device and the app can open it. You can delete it at any time.</p>;
  return source.plan ? <p className="no-print text-sm text-ink-soft">A copy is kept on this device, encrypted, so it opens without a connection. Signing out removes it.</p> : null;
}

function PlanBody({ source }: { source: Extract<Source, { mode: 'account' | 'guest' | 'offline' }> }) {
  const plan = source.plan ?? emptySafetyPlan();
  const empty = isPlanEmpty(plan);
  const canEdit = source.mode !== 'offline';
  return (
    <>
      <DeviceNote source={source} />
      {empty && canEdit && (
        <section className="no-print patch-quilted flex flex-col gap-3">
          <h2 className="text-xl">Make a plan while things are calm</h2>
          <p className="text-ink-soft">A few lines in each part is plenty, and every part is optional. When a hard moment comes, it's here to read, one step at a time.</p>
          <Link className="btn btn-primary" to="/safety-plan/edit">Make your plan</Link>
        </section>
      )}
      <ol className="flex flex-col gap-6">
        {SAFETY_PLAN_SECTIONS.map((section, index) => (
          <Step key={section.key} section={section} number={index + 1} plan={plan} />
        ))}
      </ol>
      {!empty && canEdit && <PlanActions source={source} />}
    </>
  );
}

function Step({ section, number, plan }: { section: PlanSection; number: number; plan: SafetyPlan }) {
  const helplines = section.key === 'professionals';
  const items = plan[section.key];
  if (items.length === 0 && !helplines) return null;
  return (
    <li value={number} className="plan-step flex gap-3.5">
      <span aria-hidden="true" className="plan-number">{number}</span>
      <section aria-labelledby={`step-${section.key}`} className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 id={`step-${section.key}`} className="text-2xl leading-tight"><span className="sr-only">Step {number}: </span>{section.title}</h2>
        {section.kind === 'list' ? (
          <ul className="flex flex-col gap-1.5 text-lg">
            {(items as string[]).map((item, i) => <li key={i} className="break-words">{item}</li>)}
          </ul>
        ) : (
          <ul className="flex flex-col gap-2">
            {(items as PlanContact[]).map((c, i) => <ContactCall key={i} contact={c} />)}
            {helplines && (
              <>
                <li>
                  <a className="btn btn-call w-full" href={`tel:${EMERGENCY_NUMBER.tel}`}>
                    <Phone aria-hidden="true" className="size-5" />
                    Call {EMERGENCY_NUMBER.display}
                  </a>
                  <p className="mt-1 text-sm text-ink-soft">{EMERGENCY_NUMBER.name}, if you or someone else is in immediate danger.</p>
                </li>
                {HELPLINES.map((line) => (
                  <li key={line.id}>
                    <a className="btn btn-primary w-full" href={`tel:${line.tel}`}>
                      <Phone aria-hidden="true" className="size-5" />
                      <span className="min-w-0 break-words">Call {line.name}, {line.display}</span>
                    </a>
                  </li>
                ))}
              </>
            )}
          </ul>
        )}
      </section>
    </li>
  );
}

function ContactCall({ contact }: { contact: PlanContact }) {
  if (!contact.phone) return <li className="text-lg break-words">{contact.name}</li>;
  return (
    <li>
      <a className="btn btn-call w-full" href={telHref(contact.phone)}>
        <Phone aria-hidden="true" className="size-5" />
        <span className="min-w-0 break-words">Call {contact.name}, {contact.phone}</span>
      </a>
    </li>
  );
}

function PlanActions({ source }: { source: Extract<Source, { mode: 'account' | 'guest' }> }) {
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: async () => {
      if (source.mode === 'account') {
        await deletePlan();
        await clearAccountCopy();
      } else await deleteDevicePlan({ kind: 'guest' });
    },
    onSuccess: async () => {
      setConfirm(false);
      await client.invalidateQueries({ queryKey: planKey });
      await client.invalidateQueries({ queryKey: deviceKey });
    },
  });
  return (
    <div className="no-print flex flex-col gap-2">
      <Link className="btn btn-secondary" to="/safety-plan/edit">Change your plan</Link>
      <button type="button" className="btn btn-quiet" onClick={() => window.print()}>
        <Printer aria-hidden="true" className="size-5" />
        Print or save as PDF
      </button>
      <button type="button" className="link self-center py-2.5 text-sm" onClick={() => setConfirm(true)}>Delete this plan</button>
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
        busy={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : null}
        title="Delete your safety plan?"
        confirmLabel="Yes, delete it"
        cancelLabel="Keep it"
      >
        {source.mode === 'account' ? "It's removed from your account and from this device. This can't be undone." : "It's removed from this device. This can't be undone."}
      </ConfirmSheet>
    </div>
  );
}

/** A plan made before signing in, on this device. Offered once it's an account, then the device copy goes. */
function GuestPlanOffer({ me, accountHasPlan }: { me: Me; accountHasPlan: boolean }) {
  const client = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const guest = useQuery({ queryKey: [...deviceKey, 'guest-offer'], queryFn: () => loadDevicePlan({ kind: 'guest' }), staleTime: 0 });
  const move = useMutation({
    mutationFn: async () => {
      const saved = await putPlan(guest.data!.plan);
      await deleteDevicePlan({ kind: 'guest' });
      const { updatedAt: _u, ...plan } = saved;
      await saveDevicePlan({ kind: 'account', userId: me.id }, plan).catch(() => {});
      return saved;
    },
    onSuccess: (saved) => {
      client.setQueryData(planKey, saved);
      void client.invalidateQueries({ queryKey: deviceKey });
    },
  });
  if (dismissed || !guest.data || isPlanEmpty(guest.data.plan)) return null;
  return (
    <section aria-labelledby="move-plan" className="no-print patch flex flex-col gap-3">
      <h2 id="move-plan" className="text-xl">You made a plan on this device before signing in</h2>
      <p className="text-ink-soft">
        {guest.data.savedAt && `It was last saved on ${formatDateTime(guest.data.savedAt)}. `}
        Check it's yours, then move it to your account to keep it if this phone is lost. The copy kept only on this device is then removed.
        {accountHasPlan && ' It will replace the plan already in your account.'}
      </p>
      {move.isError && <p role="alert" className="font-medium text-madder">{errorMessage(move.error)}</p>}
      <div className="flex flex-col gap-2">
        <button type="button" className="btn btn-primary" disabled={move.isPending} onClick={() => move.mutate()}>
          {move.isPending ? 'Moving' : 'Move it to your account'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setDismissed(true)}>Not now</button>
      </div>
    </section>
  );
}

// ── Writing ──────────────────────────────────────────────────────────

export function SafetyPlanEdit() {
  const source = usePlanSource();
  if (source.mode === 'consent') return <Navigate to={withNext('/consent', '/safety-plan/edit')} replace />;
  if (source.mode === 'loading') return <PageSkeleton />;
  if (source.mode === 'error') return <ErrorState error={source.error} onRetry={source.retry} />;
  if (source.mode === 'offline') {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle className="pt-2 text-2xl" title="Change your safety plan">Change your safety plan</PageTitle>
        <p className="patch">Changing your plan needs a connection. You can still read it, and the helplines work offline.</p>
        <Link className="btn btn-secondary" to="/safety-plan">Back to your plan</Link>
      </div>
    );
  }
  return <PlanForm initial={source.plan ?? emptySafetyPlan()} account={source.mode === 'account' ? source.me : null} />;
}

function PlanForm({ initial, account }: { initial: SafetyPlan; account: Me | null }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [plan, setPlan] = useState<SafetyPlan>(initial);
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    // Never during a quick exit: a "Leave site?" prompt would hold the page on screen.
    const warn = (e: BeforeUnloadEvent) => {
      if (!isExiting()) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = (next: SafetyPlan) => {
    setPlan(next);
    setDirty(true);
    setProblem(null);
  };

  const save = useMutation({
    mutationFn: async (clean: SafetyPlan) => {
      if (account) {
        const saved = await putPlan(clean);
        client.setQueryData(planKey, saved);
        await saveDevicePlan({ kind: 'account', userId: account.id }, clean).catch(() => {});
      } else {
        await saveDevicePlan({ kind: 'guest' }, clean);
      }
    },
    onSuccess: async () => {
      setDirty(false);
      await client.invalidateQueries({ queryKey: deviceKey });
      navigate('/safety-plan', { replace: true });
    },
  });

  const submit = () => {
    const parsed = safetyPlanBody.safeParse(tidyPlan(plan));
    if (!parsed.success) {
      const phone = parsed.error.issues.some((i) => i.path.includes('phone'));
      const name = parsed.error.issues.some((i) => i.path.includes('name'));
      return setProblem(
        phone ? 'A phone number can only have digits, spaces, and + ( ) -. Check the numbers above.'
          : name ? 'Each person needs a name, even just a first name.'
            : 'Something above needs another look.',
      );
    }
    save.mutate(parsed.data);
  };

  return (
    <form
      className="flex flex-col gap-7"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <PageTitle className="pt-2 text-2xl" title="Your safety plan">{isPlanEmpty(initial) ? 'Make your safety plan' : 'Change your safety plan'}</PageTitle>
        <p className="mt-1 text-ink-soft">Write it at a calmer time. Short lines are best, and every part is optional. You can change it whenever you like.</p>
      </div>

      {SAFETY_PLAN_SECTIONS.map((section, index) =>
        section.kind === 'list' ? (
          <ListSection key={section.key} section={section} number={index + 1} items={plan[section.key] as string[]} onChange={(items) => change({ ...plan, [section.key]: items })} />
        ) : (
          <ContactSection key={section.key} section={section} number={index + 1} items={plan[section.key] as PlanContact[]} onChange={(items) => change({ ...plan, [section.key]: items })} />
        ),
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-soft">
          {account
            ? 'Saved to your account, encrypted. A copy is kept on this device, encrypted, so it opens without a connection.'
            : 'Without an account, this plan is kept only on this device, encrypted. Anyone who uses this device and the app can open it. You can delete it at any time.'}
        </p>
        {(problem || save.isError) && <p role="alert" className="font-medium text-madder">{problem ?? `${errorMessage(save.error)} Your writing is still here.`}</p>}
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving' : 'Save your plan'}</button>
        <button type="button" className="btn btn-quiet" onClick={() => (dirty ? setConfirmLeave(true) : navigate('/safety-plan'))}>Cancel</button>
      </div>

      <ConfirmSheet
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => navigate('/safety-plan')}
        title="Leave without saving?"
        confirmLabel="Leave without saving"
        cancelLabel="Keep writing"
      >
        What you've changed here won't be kept.
      </ConfirmSheet>
    </form>
  );
}

function SectionFrame({ section, number, children }: { section: PlanSection; number: number; children: React.ReactNode }) {
  const legendId = useId();
  return (
    <fieldset aria-labelledby={legendId} className="flex flex-col gap-3">
      <div className="flex gap-3">
        <span aria-hidden="true" className="plan-number">{number}</span>
        <div className="min-w-0">
          <legend id={legendId} className="font-display text-xl font-semibold leading-tight">{section.title}</legend>
          <p className="mt-1 text-sm text-ink-soft">{section.prompt}</p>
          <p className="mt-0.5 text-sm text-ink-soft italic">For example: {section.example}</p>
        </div>
      </div>
      {children}
    </fieldset>
  );
}

function ListSection({ section, number, items, onChange }: { section: PlanSection; number: number; items: string[]; onChange: (items: string[]) => void }) {
  // One empty row to start, so a section is ready to write in.
  const rows = items.length === 0 ? [''] : items;
  return (
    <SectionFrame section={section} number={number}>
      <ul className="flex flex-col gap-2">
        {rows.map((value, i) => (
          <li key={i} className="flex items-center gap-1">
            <input
              className="field min-w-0 flex-1"
              aria-label={`Item ${i + 1}`}
              maxLength={SAFETY_PLAN_ITEM_MAX}
              value={value}
              onChange={(e) => onChange(rows.map((r, j) => (j === i ? e.target.value : r)))}
            />
            {(rows.length > 1 || value) && (
              <button type="button" aria-label={`Remove item ${i + 1}`} className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                <X aria-hidden="true" className="size-5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {rows.length < SAFETY_PLAN_MAX_ITEMS && (
        <button type="button" className="btn btn-quiet btn-small self-start" onClick={() => onChange([...rows, ''])}>
          <Plus aria-hidden="true" className="size-4" />
          Add another
        </button>
      )}
    </SectionFrame>
  );
}

function ContactSection({ section, number, items, onChange }: { section: PlanSection; number: number; items: PlanContact[]; onChange: (items: PlanContact[]) => void }) {
  const set = (i: number, patch: Partial<PlanContact>) => onChange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <SectionFrame section={section} number={number}>
      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((c, i) => (
            <li key={i} className="patch flex flex-col gap-2 p-3">
              <div className="flex items-center gap-1">
                <input className="field min-w-0 flex-1" aria-label={`Name ${i + 1}`} placeholder="Name" maxLength={CONTACT_NAME_MAX} value={c.name} onChange={(e) => set(i, { name: e.target.value })} />
                <button type="button" aria-label={`Remove ${c.name || `person ${i + 1}`}`} className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  <X aria-hidden="true" className="size-5" />
                </button>
              </div>
              <input className="field" type="tel" inputMode="tel" autoComplete="off" aria-label={`Phone ${i + 1}`} placeholder="Phone number" maxLength={CONTACT_PHONE_MAX} value={c.phone} onChange={(e) => set(i, { phone: e.target.value })} />
            </li>
          ))}
        </ul>
      )}
      {section.key === 'professionals' && <p className="text-sm text-ink-soft">Emergency {EMERGENCY_NUMBER.display} and the helplines are always shown in your plan. You don't need to add them.</p>}
      {items.length < SAFETY_PLAN_MAX_ITEMS && (
        <button type="button" className="btn btn-quiet btn-small self-start" onClick={() => onChange([...items, { name: '', phone: '' }])}>
          <Plus aria-hidden="true" className="size-4" />
          {section.key === 'helpContacts' ? 'Add a person' : 'Add a professional'}
        </button>
      )}
    </SectionFrame>
  );
}
