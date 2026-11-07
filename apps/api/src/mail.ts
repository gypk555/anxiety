import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { formatOtp } from '@anxiocare/shared';
import nodemailer from 'nodemailer';
import type { Config } from './config.ts';

export type CodePurpose = 'login' | 'register' | 'password_reset' | 'password_set' | 'email_change' | 'email_change_current' | 'account_delete' | 'reauth';
export type MailPurpose =
  | CodePurpose
  | 'email_changed_notice'
  | 'new_signin_notice'
  | 'account_exists_notice'
  | 'password_changed_notice'
  | 'google_linked_notice'
  | 'google_unlinked_notice'
  | 'operator_notice';

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
  register: 'Your verification code',
  password_reset: 'Your password reset code',
  password_set: 'Your verification code for a new password',
  email_change: 'Your verification code for your new address',
  email_change_current: 'Your verification code for your current address',
  account_delete: 'Your confirmation code',
  reauth: 'Your code to confirm it is you',
  email_changed_notice: 'Your email address was changed',
  new_signin_notice: 'New sign-in to your account',
  account_exists_notice: 'About your account',
  password_changed_notice: 'Your password was changed',
  google_linked_notice: 'Google sign-in was added to your account',
  google_unlinked_notice: 'Google sign-in was removed from your account',
};

const INTRO: Record<CodePurpose, string> = {
  login: 'Use this code to sign in.',
  register: 'Use this code to finish creating your account.',
  password_reset: 'Use this code to choose a new password. Until you do, your password stays as it is.',
  password_set: 'Use this code to add a password to your account.',
  email_change: 'Someone asked to move an account to this email address. Enter this code in the box for your new address.',
  email_change_current: 'Someone asked to change the email address on your account. Enter this code in the box for your current address. Without it, the address stays as it is.',
  account_delete: 'Use this code to confirm deleting your account. You cannot undo this.',
  reauth: 'Use this code to confirm it is you, before changing how you sign in to your account.',
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
    text: `Your account was just signed in to on this device: ${device}.\n\nIf that was you, there is nothing to do.\n\nIf it was not, open Settings in the app and choose "Sign out on all devices", then change your password there and the password of this email account, because sign-in codes are sent here.\n`,
  };
}

/** Someone asked to create an account with an address that has one. It tells them no more than the code mail would. */
export function accountExistsNotice(to: string): MailMessage {
  return {
    to,
    purpose: 'account_exists_notice',
    code: null,
    subject: SUBJECTS.account_exists_notice,
    text: 'Someone asked to create an account with this email address, but you already have an account. Sign in, or reset your password if you have forgotten it.\n\nIf this was not you, you can ignore this message. Nothing has changed.\n',
  };
}

export function passwordChangedNotice(to: string): MailMessage {
  return {
    to,
    purpose: 'password_changed_notice',
    code: null,
    subject: SUBJECTS.password_changed_notice,
    text: 'The password on your account was just changed or added, and other devices were signed out.\n\nIf this was not you, reset your password straight away, then change the password of this email account too, because reset codes are sent here.\n',
  };
}

export function googleLinkedNotice(to: string): MailMessage {
  return {
    to,
    purpose: 'google_linked_notice',
    code: null,
    subject: SUBJECTS.google_linked_notice,
    text: 'A Google account was just connected to your account from Settings, so it can now be used to sign in.\n\nIf this was not you, reset your password straight away: that also disconnects Google and signs out every device.\n',
  };
}

export function googleUnlinkedNotice(to: string): MailMessage {
  return {
    to,
    purpose: 'google_unlinked_notice',
    code: null,
    subject: SUBJECTS.google_unlinked_notice,
    text: 'Your account can no longer be signed in to with Google. Email codes still work, and so does your password if you have one.\n\nIf this was not you, reset your password straight away.\n',
  };
}

/** A reset disconnects Google, because whoever reset may not be whoever connected it. */
export function googleDisconnectedByResetNotice(to: string): MailMessage {
  return {
    to,
    purpose: 'google_unlinked_notice',
    code: null,
    subject: SUBJECTS.google_unlinked_notice,
    text: 'Your password was just reset, so Google was disconnected from your account. To sign in with Google again, sign in another way and choose "Connect Google" in Settings.\n\nIf you did not reset your password, reset it again now, then change the password of this email account too, because reset codes are sent here.\n',
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

export function smtpTransport(config: Extract<Config['mail'], { kind: 'smtp' }>) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
  });
}

function smtpMailer(config: Extract<Config['mail'], { kind: 'smtp' }>): Mailer {
  const transport = smtpTransport(config);
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
