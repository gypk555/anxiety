import { meResponse, type Profile } from '@anxiocare/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { errorMessage, request } from '@/lib/api';
import { accountStep, safeNext, withNext } from '@/lib/next-path';
import { profilePatch } from '@/lib/profile';
import { meKey, useMe } from '@/lib/queries';
import { PageTitle } from '@/ui/PageTitle';
import { ProfileForm } from '@/ui/ProfileForm';
import { ErrorState, PageSkeleton } from '@/ui/States';

/**
 * "About you": offered once, after consent and the name, and never a gate. Save and Skip for now weigh the same, and
 * either one records that it was seen, so it isn't offered again. Every detail can be changed later in Settings.
 */
export default function AboutYou() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useMe();
  const [profile, setProfile] = useState<Profile | null>(null);

  const finish = useMutation({
    mutationFn: async (save: boolean) => {
      if (save && profile) await request('PATCH', '/me/profile', { body: profilePatch(profile) });
      return request('POST', '/me/about-seen', { schema: meResponse });
    },
    onSuccess: (saved) => {
      client.setQueryData(meKey, saved);
      navigate(next, { replace: true });
    },
  });

  if (me.isPending || finish.isSuccess) return <PageSkeleton />;
  if (me.data === undefined) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  if (me.data === null) return <Navigate to={withNext('/sign-in', next)} replace />;
  const owed = accountStep(me.data, next);
  if (owed) return <Navigate to={owed} replace />;
  if (me.data.aboutSeen) return <Navigate to={next} replace />;
  const value = profile ?? me.data.profile;

  return (
    <form className="flex flex-1 flex-col" noValidate onSubmit={(e) => { e.preventDefault(); finish.mutate(true); }}>
      <PageTitle className="pt-2 text-2xl" title="About you">About you</PageTitle>
      <p className="mt-2 text-ink-soft">All optional. It helps you choose what to put in a report for your doctor, and suggests tools that fit. It's never used to compare you with anyone.</p>
      <div className="mt-5">
        <ProfileForm idPrefix="about" value={value} onChange={setProfile} />
      </div>
      <p className="mt-4 text-sm text-ink-soft">These are encrypted, and you can change or remove any of them in Settings.</p>
      <div className="mt-3" aria-live="polite">
        {finish.error && <p role="alert" className="font-medium text-madder">{errorMessage(finish.error)}</p>}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-6">
        <button type="button" className="btn btn-secondary" disabled={finish.isPending} onClick={() => finish.mutate(false)}>Skip for now</button>
        <button type="submit" className="btn btn-secondary" disabled={finish.isPending}>{finish.isPending ? 'Saving' : 'Save'}</button>
      </div>
    </form>
  );
}
