import { Navigate, Outlet, useLocation } from 'react-router';
import { withNext } from '@/lib/next-path';
import { useMe } from '@/lib/queries';
import { ErrorState, PageSkeleton } from '@/ui/States';

/** Screens that need an account which has accepted the current privacy notice. */
export function RequireAccount() {
  const location = useLocation();
  const me = useMe();
  const here = location.pathname + location.search;

  if (me.isPending) return <PageSkeleton />;
  if (me.isError && me.data === undefined) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  if (!me.data) return <Navigate to={withNext('/sign-in', here)} replace />;
  if (me.data.consentRequired) return <Navigate to={withNext('/consent', here)} replace />;
  return <Outlet />;
}
