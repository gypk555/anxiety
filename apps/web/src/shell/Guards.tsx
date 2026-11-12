import { Navigate, Outlet, useLocation } from 'react-router';
import { accountStep, withNext } from '@/lib/next-path';
import { useMe } from '@/lib/queries';
import { ErrorState, PageSkeleton } from '@/ui/States';

/** Screens that need an account which has accepted the current privacy notice and given a name. */
export function RequireAccount() {
  const location = useLocation();
  const me = useMe();
  const here = location.pathname + location.search;

  if (me.isPending) return <PageSkeleton />;
  if (me.isError && me.data === undefined) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  if (!me.data) return <Navigate to={withNext('/sign-in', here)} replace />;
  const step = accountStep(me.data, here);
  if (step) return <Navigate to={step} replace />;
  return <Outlet />;
}
