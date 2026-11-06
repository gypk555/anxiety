import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { PageTitle } from '@/ui/PageTitle';
import { Shell } from './Shell';

const isChunkError = (error: unknown) =>
  error instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically/i.test(error.message);

/**
 * Shown inside the shell, so "Get help" stays in place. Help itself is in the first
 * bundle, so its link works even when this screen appeared because a chunk failed.
 */
export function RouteError() {
  const error = useRouteError();
  const chunk = isChunkError(error);
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  return (
    <section className="flex flex-col gap-3">
      <PageTitle className="text-2xl" title="Something went wrong">
        {chunk ? "This screen didn't load" : 'Something went wrong'}
      </PageTitle>
      <p className="text-ink-soft">
        {chunk
          ? 'The connection may have dropped while it was loading. Your answers so far are still here.'
          : 'It was our fault, not yours. Reloading usually sorts it out.'}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <Link className="btn btn-primary" to="/help">Go to Help</Link>
        <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    </section>
  );
}

/** Last resort if the shell itself failed: plain links, a full page load. */
export function RootError() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl">Something went wrong</h1>
      <p>Reloading usually sorts it out. Help is one tap away if you need it.</p>
      <a className="btn btn-primary" href="/help">Go to Help</a>
      <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>Reload</button>
    </div>
  );
}

export function NotFound() {
  return (
    <section className="flex flex-col gap-3">
      <PageTitle className="text-2xl" title="Page not found">There's nothing at this address</PageTitle>
      <p className="text-ink-soft">The link may be old or mistyped, or what it pointed to may have been deleted.</p>
      <div className="mt-2 flex flex-col gap-2">
        <Link className="btn btn-primary" to="/">Go home</Link>
        <Link className="btn btn-secondary" to="/help">Go to Help</Link>
      </div>
    </section>
  );
}

export { Shell };
