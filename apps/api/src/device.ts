const BROWSERS: readonly [string, string][] = [
  ['Edg', 'Edge'],
  ['OPR/', 'Opera'],
  ['SamsungBrowser', 'Samsung Internet'],
  ['Firefox/', 'Firefox'],
  ['FxiOS', 'Firefox'],
  ['CriOS', 'Chrome'],
  ['Chrome/', 'Chrome'],
  ['Safari/', 'Safari'],
];

const SYSTEMS: readonly [string, string][] = [
  ['iPhone', 'iPhone'],
  ['iPad', 'iPad'],
  ['Android', 'Android'],
  ['Windows', 'Windows'],
  ['CrOS', 'ChromeOS'],
  ['Macintosh', 'Mac'],
  ['Linux', 'Linux'],
];

/** Deliberately coarse ("Safari on iPhone"): the User-Agent itself is never stored. */
export function deviceLabel(userAgent: string | undefined): string {
  const ua = (userAgent ?? '').slice(0, 512);
  const browser = BROWSERS.find(([needle]) => ua.includes(needle))?.[1];
  const system = SYSTEMS.find(([needle]) => ua.includes(needle))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown device';
}
