import { useEffect, useRef, type ReactNode } from 'react';

let firstRender = true;

/**
 * The h1 of a screen. Sets the document title and, after any navigation, moves focus
 * here so screen reader and keyboard users land at the start of the new screen.
 */
export function PageTitle({ children, title, className = '' }: { children: ReactNode; title?: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const text = title ?? ref.current?.textContent ?? '';
    document.title = text ? `${text} | AnxioCare` : 'AnxioCare';
    if (firstRender) {
      firstRender = false;
      return;
    }
    ref.current?.focus({ preventScroll: true });
  }, [title]);
  return (
    <h1 ref={ref} tabIndex={-1} className={className}>
      {children}
    </h1>
  );
}
