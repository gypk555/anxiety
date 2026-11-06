import { Link } from 'react-router';
import { NetworkError, errorMessage } from '@/lib/api';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4 pt-2">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const offline = error instanceof NetworkError;
  return (
    <div role="alert" className="patch">
      <h2 className="text-xl">{title ?? (offline ? "You're offline, or the connection dropped" : "This didn't load")}</h2>
      <p className="mt-2 text-ink-soft">
        {offline
          ? 'Saved check-ins and journal entries need a connection. Help, breathing and grounding work without one.'
          : errorMessage(error)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {onRetry && <button type="button" className="btn btn-primary btn-small" onClick={onRetry}>Try again</button>}
        <Link className="btn btn-quiet btn-small" to="/help">Go to Help</Link>
      </div>
    </div>
  );
}
