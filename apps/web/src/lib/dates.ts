import { GAD7_RETAKE_INTERVAL_DAYS } from '@anxiocare/shared';

const dayFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const shortFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

export const formatDate = (iso: string | Date) => dayFormat.format(new Date(iso));
export const formatShortDate = (iso: string | Date) => shortFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => `${dayFormat.format(new Date(iso))}, ${timeFormat.format(new Date(iso))}`;

export function nextCheckInDate(takenAt: string): Date {
  const next = new Date(takenAt);
  next.setDate(next.getDate() + GAD7_RETAKE_INTERVAL_DAYS);
  return next;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Hello';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
