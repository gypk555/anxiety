import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { formatOtp } from '@anxiocare/shared';
import nodemailer from 'nodemailer';
import type { Config } from './config.ts';

export type CodePurpose = 'login' | 'email_change' | 'email_change_current' | 'account_delete';
export type MailPurpose = CodePurpose | 'email_changed_notice' | 'new_signin_notice' | 'operator_notice';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  purpose: MailPurpose;
  /** The code in this message, when it has one. Used by the file transport only. */
  code: string | null;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

// Lock screens and shared inboxes expose mail, so nothing here may name the product or its subject matter.
const SUBJECTS: Record<Exclude<MailPurpose, 'operator_notice'>, string> = {
  login: 'Your sign-in code',
  email_change: 'Your verification code for your new address',
  email_change_current: 'Your verification code for your current address',
  account_delete: 'Your confirmation code',
  email_changed_notice: 'Your email address was changed',
  new_signin_notice: 'New sign-in to your account',
};

const INTRO: Record<CodePurpose, string> = {
  login: 'Use this code to sign in.',
  email_change: 'Someone asked to move an account to this email address. Enter this code in the box for your new address.',
  email_change_current: 'Someone asked to change the email address on your account. Enter this code in the box for your current address. Without it, the address stays as it is.',
  account_delete: 'Use this code to confirm deleting your account. You cannot undo this.',
};

export function otpMail(to: string, purpose: CodePurpose, code: string): MailMessage {
  return {
    to,
    purpose,
    code,
    subject: SUBJECTS[purpose],
    text: `${INTRO[purpose]}\n\n${formatOtp(code)}\n\nIt expires in 10 minutes. If you did not ask for this, you can ignore this message.\n`,
  };
}

export function emailChangedNotice(to: string): MailMessage {
  return {
    to,
    purpose: 'email_changed_notice',
    code: null,
    subject: SUBJECTS.email_changed_notice,
    text: 'The email address on your account was just changed, and other devices were signed out. If this was not you, reply to the operator through the contact details in the app.\n',
  };
}

/** `device` is the coarse label from a fixed vocabulary (see device.ts), so nothing here is caller-controlled text. */
export function newSignInNotice(to: string, device: string): MailMessage {
  return {
    to,
    purpose: 'new_signin_notice',
    code: null,
    subject: SUBJECTS.new_signin_notice,
    text: `Your account was just signed in to on this device: ${device}.\n\nIf that was you, there is nothing to do.\n\nIf it was not, open Settings in the app and choose "Sign out on all devices", then change the password of this email account, because sign-in codes are sent here.\n`,
  };
}

/** From scripts/notify-all.ts. The operator writes these, so the tool checks the subject: see notify.ts. */
export function operatorNotice(to: string, subject: string, text: string): MailMessage {
  return { to, purpose: 'operator_notice', code: null, subject, text };
}

/**
 * dev/e2e transport. Appends one JSON object per line:
 * {"at":ISO-8601,"to":string,"subject":string,"text":string,"purpose":MailPurpose,"code":string|null}
 */
function fileMailer(path: string, from: string, echoCodes: boolean): Mailer {
  return {
    async send(message) {
      await mkdir(dirname(path), { recursive: true });
      const line = JSON.stringify({
        at: new Date().toISOString(),
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        purpose: message.purpose,
        code: message.code,
      });
      await appendFile(path, `${line}\n`, { mode: 0o600 });
      // eslint-disable-next-line no-console
      if (echoCodes && message.code) console.log(`[dev mail] ${message.purpose} code: ${message.code}`);
    },
  };
}

function smtpMailer(config: Extract<Config['mail'], { kind: 'smtp' }>): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
  });
  return {
    async send(message) {
      await transport.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text });
    },
  };
}

export function createMailer(config: Config): Mailer {
  if (config.mail.kind === 'smtp') return smtpMailer(config.mail);
  // Config validation refuses this in production; keep a second check at the point of use.
  if (config.env === 'production') throw new Error('file mail transport is refused in production');
  return fileMailer(config.mail.path, config.mail.from, config.env === 'development');
}
