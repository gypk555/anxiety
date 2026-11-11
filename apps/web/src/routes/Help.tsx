import { EMERGENCY_NUMBER, HELPLINES, HELPLINES_CHECK_METHOD, HELPLINES_CHECKED_ON, helplinesCheckNote, type Helpline } from '@anxiocare/shared';
import { MessageCircle, Phone } from 'lucide-react';
import { Link } from 'react-router';
import { formatDate } from '@/lib/dates';
import { PageTitle } from '@/ui/PageTitle';

/**
 * Shipped in the first bundle and precached, and asks nothing of the network or the
 * server. No login, no animation. One tap from any screen to a ringing phone.
 */
export function Help() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="emergency" className="flex flex-col gap-3">
        <PageTitle className="text-2xl" title="Get help">
          <span id="emergency">If you or someone else is in immediate danger</span>
        </PageTitle>
        <a className="btn btn-call w-full" href={`tel:${EMERGENCY_NUMBER.tel}`}>
          <Phone aria-hidden="true" className="size-5" />
          Call {EMERGENCY_NUMBER.display}
        </a>
        <p className="text-sm text-ink-soft">{EMERGENCY_NUMBER.name}. Free from any phone in India.</p>
      </section>

      <hr className="stitch-rule" />

      <section aria-labelledby="talk" className="flex flex-col gap-1">
        <h2 id="talk" className="text-xl">Talk to someone</h2>
        <p className="text-ink-soft">These services are free, and calling is enough. You don't need to know what to say, or have an account here.</p>
        <ul className="mt-3 flex flex-col gap-3">
          {HELPLINES.map((line) => <HelplineItem key={line.id} line={line} />)}
        </ul>
      </section>

      <section aria-labelledby="harm" className="patch">
        <h2 id="harm" className="text-xl">If you're having thoughts of harming yourself</h2>
        <SelfHarmGuidance />
      </section>

      <section aria-labelledby="plan" className="flex flex-col gap-2">
        <h2 id="plan" className="text-xl">Your safety plan</h2>
        <p className="text-ink-soft">The steps you wrote for hard moments, and the people you can call. Works without an account, and offline once it has opened.</p>
        <Link className="btn btn-secondary" to="/safety-plan">Open your safety plan</Link>
      </section>

      <section aria-labelledby="now" className="flex flex-col gap-2">
        <h2 id="now" className="text-xl">While you wait, or if you can't call</h2>
        <div className="grid grid-cols-2 gap-2">
          <Link className="btn btn-quiet" to="/tools/breathe">Breathe</Link>
          <Link className="btn btn-quiet" to="/tools/ground">Ground yourself</Link>
        </div>
      </section>

      <QuickExitHelp />

      <p className="text-xs text-ink-soft">
        {helplinesCheckNote(HELPLINES_CHECK_METHOD, formatDate(HELPLINES_CHECKED_ON))} These services are run independently of AnxioCare, which is not an emergency service.
      </p>
    </div>
  );
}

export function SelfHarmGuidance() {
  const primary = HELPLINES[0]!;
  return (
    <div className="mt-2 flex flex-col gap-2">
      <p>
        You don't have to carry this alone, and it can ease with support. Please call {primary.name} on{' '}
        <a className="link" href={`tel:${primary.tel}`}>{primary.display}</a> now, any time of day. If you feel you might act on these thoughts, call{' '}
        <a className="link" href={`tel:${EMERGENCY_NUMBER.tel}`}>{EMERGENCY_NUMBER.display}</a> or go to the nearest hospital.
      </p>
      <p>If you can, stay with someone you trust, tell them how you're feeling, and put distance between yourself and anything you could use to hurt yourself.</p>
    </div>
  );
}

function HelplineItem({ line }: { line: Helpline }) {
  return (
    <li className="patch flex flex-col gap-2">
      <h3 className="text-lg font-display">{line.name}</h3>
      <p className="text-sm text-ink-soft">{line.description}</p>
      <p className="text-sm"><span className="sr-only">Open: </span>{line.availability}</p>
      <div className="mt-1 flex flex-col gap-2">
        <a className="btn btn-primary w-full" href={`tel:${line.tel}`}>
          <Phone aria-hidden="true" className="size-5" />
          Call {line.display}
        </a>
        {line.whatsapp && (
          <a className="btn btn-secondary w-full" href={`https://wa.me/${line.whatsapp}`} rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" className="size-5" />
            Message on WhatsApp
          </a>
        )}
        {line.url && (
          <a className="link self-start py-2 text-sm" href={line.url} rel="noopener noreferrer">
            Visit the {line.name} website<span className="sr-only"> (needs internet)</span>
          </a>
        )}
      </div>
    </li>
  );
}

/** What quick exit does and, as plainly, what it can't do. */
function QuickExitHelp() {
  return (
    <section aria-labelledby="quick-exit" className="flex flex-col gap-2">
      <h2 id="quick-exit" className="text-xl">About quick exit</h2>
      <div className="flex flex-col gap-2 text-ink-soft">
        <p>If you need to hide this app at once, tap "Quick exit" at the top of any screen, or press Escape three times quickly on a keyboard. It opens a weather search straight away and clears what this app was showing. It doesn't ask first, and it doesn't sign you out.</p>
        <p>It can't remove the pages you visited before it from your browser's history. Someone pressing Back may still see that AnxioCare was open, and if you were signed in, your account is still signed in on this phone.</p>
        <p>To leave no trace, use a private or incognito window, which your browser forgets when you close it. To clear it afterwards, delete your browsing history in your browser's settings, and sign out in Settings here.</p>
      </div>
    </section>
  );
}
