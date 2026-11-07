import { useRegisterSW } from 'virtual:pwa-register/react';

/** Small, dismissible: an update must never interrupt someone mid check-in. */
export function UpdatePrompt({ raised }: { raised: boolean }) {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className={`no-print fixed inset-x-3 z-40 mx-auto flex max-w-md items-center justify-between gap-2 rounded-2xl bg-primary px-4 py-2 text-on-primary ${
        raised ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-4' : 'bottom-[max(0.75rem,env(safe-area-inset-bottom))]'
      }`}
    >
      <span className="text-sm">New version available</span>
      <span className="flex items-center">
        <button type="button" className="min-h-11 px-3 text-sm underline underline-offset-2" onClick={() => setNeedRefresh(false)}>Later</button>
        <button type="button" className="min-h-11 px-3 text-sm font-semibold underline underline-offset-2" onClick={() => void updateServiceWorker(true)}>Refresh</button>
      </span>
    </div>
  );
}
