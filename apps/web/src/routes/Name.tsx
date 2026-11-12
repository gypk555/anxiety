import { meResponse } from '@anxiocare/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { errorMessage, request } from '@/lib/api';
import { afterSignIn, safeNext, withNext } from '@/lib/next-path';
import { clearClientData, meKey, useMe } from '@/lib/queries';
import { nameProblem } from '@/lib/name';
import { NameField } from '@/ui/NameField';
import { PageTitle } from '@/ui/PageTitle';
import { ErrorState, PageSkeleton } from '@/ui/States';

/**
 * "What should we call you?", for an account that has none: one made with Google (which is never asked for a name),
 * by email code, or before the name was required. Asked once, after consent. Like the consent screen, it never stands
 * in the way of Help, Quick exit (both in the header), signing out, or Settings, where download and delete are.
 */
export default function Name() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useMe();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: (displayName: string) => request('PATCH', '/me', { body: { displayName }, schema: meResponse }),
    onSuccess: (saved) => {
      client.setQueryData(meKey, saved);
      // On to the optional About you, if it hasn't been offered yet.
      navigate(afterSignIn(saved, next), { replace: true });
    },
  });

  const signOut = useMutation({
    mutationFn: () => request('POST', '/auth/logout').catch(() => {}),
    onSettled: () => {
      clearClientData();
      client.setQueryData(meKey, null);
      navigate('/', { replace: true });
    },
  });

  if (me.isPending || leaving || save.isSuccess) return <PageSkeleton />;
  if (me.data === undefined) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  if (me.data === null) return <Navigate to={withNext('/sign-in', next)} replace />;
  // Consent comes first. With a name already, there is nothing to ask.
  if (me.data.consentRequired || me.data.displayName) return <Navigate to={afterSignIn(me.data, next)} replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = nameProblem(name);
    setProblem(found);
    if (found) {
      fieldRef.current?.focus();
      return;
    }
    save.mutate(name.trim());
  };

  return (
    <form className="flex flex-1 flex-col" onSubmit={submit} noValidate>
      <PageTitle className="pt-2 text-2xl" title="Your name">What should we call you?</PageTitle>
      <p className="mt-2 text-ink-soft">A first name or a nickname is fine. We use it to greet you, and put it on a report for your doctor only if you choose.</p>
      <div className="mt-5">
        <NameField
          ref={fieldRef}
          value={name}
          error={problem}
          hint="You can change it later in Settings."
          onChange={(value) => { setName(value); setProblem(null); }}
        />
      </div>
      <div className="mt-3" aria-live="polite">
        {save.error && <p role="alert" className="font-medium text-madder">{errorMessage(save.error)}</p>}
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving' : 'Continue'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setLeaving(true); signOut.mutate(); }}>Not now, sign me out</button>
        <p className="text-center text-sm"><Link className="link inline-block py-2" to="/settings">Download or delete my data</Link></p>
        <p className="text-center text-sm"><Link className="link inline-block py-2" to="/tools">Use the tools for now</Link></p>
      </div>
    </form>
  );
}
