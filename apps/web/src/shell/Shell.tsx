import { Suspense, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { LifeBuoy, Home, Wind, NotebookPen, LineChart, Settings as SettingsIcon, WifiOff } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useMatches, useNavigationType } from 'react-router';
import { avatarFor, type Me } from '@anxiocare/shared';
import { useQuery } from '@tanstack/react-query';
import { useOnline } from '@/lib/online';
import { meKey } from '@/lib/queries';
import { syncThemeColor } from '@/lib/theme';
import { Logomark } from '@/ui/Rings';
import { PageSkeleton } from '@/ui/States';
import { installEscapeExit, quickExit } from '@/lib/quick-exit';
import { QuickExitButton } from '@/ui/QuickExit';
import { UpdatePrompt } from './UpdatePrompt';

export interface RouteHandle {
  /** One-task screens: no tab bar. */
  focus?: boolean;
  /** Always-night canvas, whatever the theme: the breathing screen. */
  night?: boolean;
  /** Wider column, for reading. */
  wide?: boolean;
}

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/tools', label: 'Tools', icon: Wind, end: false },
  { to: '/journal', label: 'Journal', icon: NotebookPen, end: false },
  { to: '/trends', label: 'Trends', icon: LineChart, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false },
] as const;

export function GetHelpLink() {
  const { pathname } = useLocation();
  const here = pathname === '/help';
  return (
    <Link
      to="/help"
      aria-current={here ? 'page' : undefined}
      className="no-print inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-madder px-3.5 font-semibold text-sm text-madder no-underline"
    >
      <LifeBuoy aria-hidden="true" className="size-[1.125rem]" />
      Get help
    </Link>
  );
}

function Wordmark() {
  return (
    <Link to="/" aria-label="AnxioCare, home" className="no-print -ml-1 flex min-h-11 items-center gap-2 pr-2 no-underline">
      <Logomark className="size-7" />
      <span className="font-display text-[1.375rem] font-semibold tracking-tight max-[389px]:sr-only">AnxioCare</span>
    </Link>
  );
}

function TabLinks({ layout }: { layout: 'bar' | 'inline' }) {
  return (
    <>
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            layout === 'bar'
              ? `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs no-underline ${
                  isActive ? 'font-semibold text-ink' : 'text-ink-soft'
                }`
              : `inline-flex min-h-11 items-center rounded-lg px-3 text-sm no-underline ${
                  isActive ? 'font-semibold text-ink underline decoration-dashed decoration-2 underline-offset-[6px]' : 'text-ink-soft'
                }`
          }
        >
          {({ isActive }) => (
            <>
              {layout === 'bar' && (
                <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive ? 'bg-surface-2' : ''}`}>
                  <Icon aria-hidden="true" className="size-5" strokeWidth={isActive ? 2.4 : 1.9} />
                </span>
              )}
              {label}
            </>
          )}
        </NavLink>
      ))}
    </>
  );
}

function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="no-print flex items-center justify-center gap-2 bg-surface-2 px-4 py-1.5 text-center text-xs">
      <WifiOff aria-hidden="true" className="size-4 shrink-0" />
      You're offline. Help, breathing and grounding still work.
    </div>
  );
}

function useScrollReset() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  useLayoutEffect(() => {
    if (type !== 'POP') window.scrollTo(0, 0);
  }, [pathname, type]);
}

/**
 * The chosen avatar, as a way to Settings. Reads only what a screen already loaded, so the header makes no request.
 * Hidden on the narrowest phones, where Quick exit and Get help need the room.
 */
function HeaderAvatar() {
  const me = useQuery<Me | null>({ queryKey: meKey, enabled: false });
  const avatar = me.data && !me.data.consentRequired ? avatarFor(me.data.profile.avatar) : undefined;
  if (!avatar) return null;
  return (
    <Link to="/settings" aria-label={`Settings, ${avatar.label}`} className="no-print grid size-11 shrink-0 place-items-center rounded-full border-2 border-line text-xl max-[359px]:hidden">
      <span aria-hidden="true">{avatar.emoji}</span>
    </Link>
  );
}

export function Shell({ children }: { children?: ReactNode }) {
  const matches = useMatches();
  const handle = Object.assign({}, ...matches.map((m) => m.handle as RouteHandle | undefined)) as RouteHandle;
  useScrollReset();
  useEffect(() => installEscapeExit(() => quickExit()), []);

  // The browser chrome follows the night canvas too.
  useEffect(() => {
    document.documentElement.classList.toggle('canvas-night', !!handle.night);
    syncThemeColor(!!handle.night);
  }, [handle.night]);

  return (
    <div className={`flex min-h-dvh flex-col overflow-x-clip bg-ground text-ink ${handle.night ? 'night' : ''}`}>
      <a href="#main" className="no-print sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">
        Skip to content
      </a>
      <OfflineBanner />
      <header className="no-print sticky top-0 z-30 bg-ground pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4">
          <Wordmark />
          {!handle.focus && (
            <nav aria-label="Main" className="hidden flex-1 justify-center gap-1 md:flex">
              <TabLinks layout="inline" />
            </nav>
          )}
          <div className="flex shrink-0 items-center gap-2">
            <HeaderAvatar />
            <QuickExitButton />
            <GetHelpLink />
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={`mx-auto flex w-full flex-1 flex-col px-4 pt-3 ${handle.wide ? 'max-w-2xl' : 'max-w-lg'} ${
          handle.focus ? 'pb-[max(1rem,env(safe-area-inset-bottom))]' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10'
        }`}
      >
        <Suspense fallback={<PageSkeleton />}>{children ?? <Outlet />}</Suspense>
      </main>
      <UpdatePrompt raised={!handle.focus} />
      {!handle.focus && (
        <nav
          aria-label="Main"
          className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t-2 border-dashed border-line bg-ground pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <TabLinks layout="bar" />
        </nav>
      )}
    </div>
  );
}
