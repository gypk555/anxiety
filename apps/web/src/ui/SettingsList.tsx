import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';

/** A labelled list of settings on one patch. `danger` sets it apart for the one action that can't be undone. */
export function SettingsGroup({ title, id, tone = 'default', heading = 'label', children }: {
  title?: string;
  id: string;
  tone?: 'default' | 'danger';
  /** `label` is the small group label Settings uses; `section` is a page section heading, as on Home. */
  heading?: 'label' | 'section' | 'hidden';
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={title ? id : undefined} className={`flex flex-col ${heading === 'section' ? 'gap-3' : 'gap-2'}`}>
      {title && (
        <h2 id={id} className={heading === 'section' ? 'text-xl' : heading === 'hidden' ? 'sr-only' : 'mx-1 font-body text-sm font-semibold tracking-normal text-ink-soft'}>{title}</h2>
      )}
      <ul className={`settings-group ${tone === 'danger' ? 'settings-group-danger' : ''}`}>{children}</ul>
    </section>
  );
}

/**
 * One setting. A button when it opens something here, a link when it goes to another page, plain text when it only
 * says how things are. Named by its title; its description and value describe it.
 */
export function SettingsRow({ icon: Icon, title, description, value, to, onClick, disabled }: {
  icon: LucideIcon;
  title: string;
  description?: string;
  value?: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const titleId = useId();
  const valueId = useId();
  const descriptionId = useId();
  const described = [value && valueId, description && descriptionId].filter(Boolean).join(' ') || undefined;
  const interactive = !!(to || onClick);
  const body = (
    <>
      <Icon aria-hidden="true" className="size-[1.375rem] shrink-0 text-madder" strokeWidth={1.9} />
      <span className="min-w-0 flex-1">
        <span id={titleId} className="settings-row-title block font-semibold">{title}</span>
        {description && <span id={descriptionId} className="block text-sm break-words text-ink-soft">{description}</span>}
      </span>
      {value && <span id={valueId} className="shrink-0 text-sm text-ink-soft">{value}</span>}
      {interactive && <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />}
    </>
  );
  // The value (what changes) is read first, then the description.
  return (
    <li>
      {to ? (
        <Link to={to} className="settings-row" aria-labelledby={titleId} aria-describedby={described}>{body}</Link>
      ) : onClick ? (
        <button type="button" className="settings-row" aria-labelledby={titleId} aria-describedby={described} disabled={disabled} onClick={onClick}>{body}</button>
      ) : (
        <div className="settings-row">{body}</div>
      )}
    </li>
  );
}
