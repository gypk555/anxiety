import { EyeOff } from 'lucide-react';
import { quickExit } from '@/lib/quick-exit';

/**
 * Leaves at once for a neutral page. Quieter than "Get help" on purpose, so it never competes with it, but always
 * there. A plain button with no confirmation: anything slower than navigating would defeat it.
 */
export function QuickExitButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => quickExit()}
      className={`no-print inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-line px-3 text-sm font-medium text-ink-soft ${className}`}
    >
      <EyeOff aria-hidden="true" className="size-4" />
      {/* Short on narrow phones, so the header still fits at 320px. The name is always "Quick exit". */}
      <span aria-hidden="true" className="min-[480px]:hidden">Exit</span>
      <span className="max-[479px]:sr-only">Quick exit</span>
    </button>
  );
}
