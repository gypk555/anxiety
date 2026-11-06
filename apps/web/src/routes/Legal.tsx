import { CONSENT_VERSION, GAD7_ATTRIBUTION, HELPLINES_CHECK_METHOD, HELPLINES_CHECKED_ON, helplinesCheckNote } from '@anxiocare/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { formatDate } from '@/lib/dates';
import { backupWindow, useMeta } from '@/lib/queries';
import { PageTitle } from '@/ui/PageTitle';

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="flex max-w-[65ch] flex-col gap-5">
      <div>
        <PageTitle className="pt-2 text-2xl" title={title}>{title}</PageTitle>
        <p className="mt-1 text-sm text-ink-soft">Version dated {formatDate(CONSENT_VERSION)}</p>
      </div>
      {children}
    </article>
  );
}

function Part({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-xl">{heading}</h2>
      <div className="flex flex-col gap-2 text-ink-soft">{children}</div>
    </section>
  );
}

/** Operator details come from the server; offline, say so rather than show a blank. */
function Operator() {
  const meta = useMeta();
  if (meta.data) {
    return (
      <>
        <p>AnxioCare is operated by {meta.data.operatorName}, the data fiduciary for your information.</p>
        <p>Grievance contact: <a className="link break-all" href={`mailto:${meta.data.grievanceEmail}`}>{meta.data.grievanceEmail}</a>. We aim to respond within 7 days.</p>
      </>
    );
  }
  if (meta.isPending) return <p>Loading the operator's contact details.</p>;
  return <p>The operator's name and grievance contact can't be loaded right now, because you appear to be offline. Open this page again when you're connected to see them.</p>;
}

/** Where things physically are. Varies by deployment, so it comes from the server; offline, say so rather than guess. */
function Locations() {
  const meta = useMeta();
  if (!meta.data) return <p>The exact locations and email provider load when you're connected.</p>;
  const { dataLocation, serverLocation, mailProvider } = meta.data;
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      <li>Your data is stored in {dataLocation}, in a database run by Supabase.</li>
      <li>Our server, in {serverLocation}, run by Render, processes it. Connections to and from that server are encrypted in transit, and your data passes through it in readable form while it is being used.</li>
      <li>Emails to you are handled by {mailProvider}, which sees your address and what the email says.</li>
    </ul>
  );
}

function BackupWindow() {
  const meta = useMeta();
  return <>{backupWindow(meta.data)}</>;
}

export function Privacy() {
  return (
    <Page title="Privacy notice">
      <Part heading="The short version">
        <p>You can use the check-in and tools without an account, and then nothing about you reaches our servers. If you create an account, we store only what's needed to show your own history back to you. No one else can see it, and you can delete it all, at once, at any time.</p>
      </Part>
      <Part heading="Without an account">
        <p>Your check-in answers and result stay in your browser's temporary storage for this tab, and are gone when you close it. They aren't sent to us. Your light or dark setting is kept on your device. Breathing, grounding and sounds run entirely on your device.</p>
      </Part>
      <Part heading="What we store if you create an account">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Your email address, to sign you in, and a display name if you add one.</li>
          <li>Your check-in answers, score, result range and date.</li>
          <li>Thought records you write.</li>
          <li>A label for each signed-in device and when it was last used, so you can review and end sessions.</li>
          <li>Your consent: which version you accepted, and when.</li>
          <li>For about an hour after we send you a code, a one-way code made from your email and network address, to limit how many can be sent. Your network address itself is not stored.</li>
        </ul>
        <p>Check-ins and thought records are health information. We store them only with your explicit consent, and you must be 18 or older. We don't ask for your age, gender, occupation or phone number.</p>
      </Part>
      <Part heading="Why, and on what basis">
        <p>We process this information on the basis of your consent, under India's Digital Personal Data Protection Act, 2023, for one purpose: giving you your own history, journal and account. We don't use it for advertising, profiling, research, or AI, and we don't sell it.</p>
      </Part>
      <Part heading="How it's protected">
        <p>Your email, name, device labels, check-ins and thought records are encrypted before they reach the database, with a key unique to you. Connections are encrypted. Signing in uses a one-time code, so there's no password to steal. The app has no third-party analytics, trackers or ad networks, and loads nothing from other companies' servers.</p>
      </Part>
      <Part heading="Who else is involved">
        <p>We use service providers only to run the service:</p>
        <Locations />
        <p>Traffic between your device and our server passes through Cloudflare, the network company Render uses, worldwide. Treat what you send as readable to Cloudflare while it passes through.</p>
        <p>Emails say things like "Your sign-in code" and never mention anxiety or health. No doctor, employer, insurer or family member gets access through AnxioCare.</p>
      </Part>
      <Part heading="How long we keep it">
        <p>Until you delete it or your account. When you do, it's removed from our database at once. Encrypted backups of the database age out <BackupWindow />, and until then a copy can exist in them. Signed-in sessions end after 30 days without use, or 90 days at most. Accounts that never agreed are deleted after 24 hours. We keep a security log of events such as sign-ins and deletions for one year, with your identity replaced by a one-way code. That log contains none of your answers or writing.</p>
      </Part>
      <Part heading="Your rights">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>See and correct your details, in Settings.</li>
          <li>Download everything we hold about you, in Settings.</li>
          <li>Delete your account and all your data, in Settings. It's removed from our database at once, and this also withdraws your consent. Encrypted backups age out <BackupWindow />.</li>
          <li>Raise a grievance with us using the contact below, and if you aren't satisfied, with the Data Protection Board of India.</li>
          <li>Nominate someone to exercise your rights if you cannot. Contact us to do this.</li>
        </ul>
      </Part>
      <Part heading="Who we are"><Operator /></Part>
      <Part heading="If this notice changes">
        <p>If we change this notice materially, we'll ask you to review and accept it again before you can see or save anything further in your account. We'll say what changed. Your data is kept while you decide, and you can still download your data, delete your account or sign out without accepting.</p>
      </Part>
      <p className="text-sm"><Link className="link" to="/terms">Read the terms</Link></p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of use">
      <Part heading="What AnxioCare is">
        <p>A free self-check for anxiety using the GAD-7 questionnaire, calming tools, a private journal, and a list of helplines in India. It is a screening and self-care tool.</p>
      </Part>
      <Part heading="What it is not">
        <p>AnxioCare isn't a medical service, and it doesn't diagnose, treat or give medical advice. A result is not a diagnosis. It doesn't replace a doctor or mental health professional, and nobody at AnxioCare monitors what you enter.</p>
        <p>It is not an emergency service. If you or someone else is in danger, call 112 or see <Link className="link" to="/help">Get help</Link>. Helplines are independent services that we don't run.</p>
      </Part>
      <Part heading="Who can use it">
        <p>Adults aged 18 and over, in India. It isn't designed for children.</p>
      </Part>
      <Part heading="Your account">
        <p>Keep access to your email secure, because a code sent there signs you in. Use the app only for yourself. Don't try to access other people's data or disrupt the service.</p>
      </Part>
      <Part heading="Breathing and grounding">
        <p>Stop any exercise if you feel dizzy, short of breath or unwell, and breathe normally. If you have a medical condition affecting your breathing, ask your doctor first.</p>
      </Part>
      <Part heading="Availability">
        <p>We work to keep the service running and your data safe, but we can't promise it will always be available. Download your data if you need a copy. The tools and helplines keep working offline once the app has loaded.</p>
      </Part>
      <Part heading="Responsibility">
        <p>The service is provided as it is, and you decide how to use what it shows you. Nothing here limits any right you have under Indian law that can't be limited.</p>
      </Part>
      <Part heading="Closing your account">
        <p>You can delete your account at any time in Settings. We may suspend an account that attacks the service or misuses it.</p>
      </Part>
      <Part heading="Governing law and contact">
        <p>These terms are governed by the laws of India.</p>
        <Operator />
      </Part>
      <p className="text-sm"><Link className="link" to="/privacy">Read the privacy notice</Link></p>
    </Page>
  );
}

export function About() {
  return (
    <Page title="About AnxioCare">
      <Part heading="What it's for">
        <p>A free, private place for adults in India to check in on their anxiety, understand the answer without being labelled, use something calming, and reach real people quickly.</p>
      </Part>
      <Part heading="The questionnaire">
        <p>The check-in uses the GAD-7. Its item and option wording is as published. The stem and the lead-in to the difficulty question are lightly adapted, because the app shows one question per screen.</p>
        <p>The score is a screening, not a diagnosis. A score of 10 or above is the published point at which further evaluation is advised.</p>
        <p>{GAD7_ATTRIBUTION}</p>
      </Part>
      <Part heading="The helplines">
        <p>{helplinesCheckNote(HELPLINES_CHECK_METHOD, formatDate(HELPLINES_CHECKED_ON))} AnxioCare isn't affiliated with these services.</p>
      </Part>
      <Part heading="Why it looks like this">
        <p>The stitched lines come from kantha, the quilts women in Bengal make from old saris, soft from years of washing and sewn together with running stitch to comfort someone.</p>
      </Part>
      <p className="flex gap-4 text-sm">
        <Link className="link" to="/privacy">Privacy</Link>
        <Link className="link" to="/terms">Terms</Link>
      </p>
    </Page>
  );
}
