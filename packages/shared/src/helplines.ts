/**
 * Safety-critical content, and shown to people as a statement of fact, so it says only what really happened.
 * Today that is a check against published sources: nobody has phoned these numbers. After phoning every one, set
 * HELPLINES_CHECK_METHOD to 'phone' and HELPLINES_CHECKED_ON to that date: docs/CLINICAL-SAFETY.md#procedure.
 */
export type HelplineCheckMethod = 'published-sources' | 'phone';
export const HELPLINES_CHECK_METHOD: HelplineCheckMethod = 'published-sources';
export const HELPLINES_CHECKED_ON = '2026-11-06';

/** The sentence on Help and About. `date` is already formatted for people. */
export function helplinesCheckNote(method: HelplineCheckMethod, date: string): string {
  return method === 'phone'
    ? `Helpline numbers confirmed by phone on ${date}.`
    : `Helpline numbers checked against published sources on ${date}. They have not yet been confirmed by phone.`;
}

export interface Helpline {
  id: string;
  name: string;
  description: string;
  availability: string;
  /** Number shown to people. */
  display: string;
  /** E.164 or short code, used for the tel: link. */
  tel: string;
  whatsapp?: string;
  url?: string;
}

export const EMERGENCY_NUMBER = { display: '112', tel: '112', name: 'Emergency services' } as const;

export const HELPLINES: readonly Helpline[] = [
  {
    id: 'tele-manas',
    name: 'Tele-MANAS',
    description: 'Government of India mental health helpline. Free counselling and referrals in many Indian languages.',
    availability: '24 hours, every day',
    display: '14416',
    tel: '14416',
    url: 'https://telemanas.mohfw.gov.in/',
  },
  {
    id: 'tele-manas-tollfree',
    name: 'Tele-MANAS (toll-free)',
    description: 'The same service, for phones that cannot dial the short code.',
    availability: '24 hours, every day',
    display: '1800-891-4416',
    tel: '+9118008914416',
  },
  {
    id: 'vandrevala',
    name: 'Vandrevala Foundation',
    description: 'Free counselling and crisis support by phone or WhatsApp.',
    availability: '24 hours, every day',
    display: '+91 99996 66555',
    tel: '+919999666555',
    whatsapp: '919999666555',
  },
  {
    id: 'icall',
    name: 'iCALL (TISS)',
    description: 'Counselling from trained professionals at the Tata Institute of Social Sciences.',
    availability: 'Monday to Saturday, daytime. Check the website for current hours.',
    display: '+91 91529 87821',
    tel: '+919152987821',
    url: 'https://icallhelpline.org/',
  },
];
