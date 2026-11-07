import { describe, expect, it } from 'vitest';
import { formatOtp, ERROR_CODES, loginBody, OTP_LENGTH, passwordChangeBody, passwordResetBody, passwordSchema, registerVerifyBody } from './schemas.ts';
import { PASSWORD_MAX, PASSWORD_MIN } from './password-length.ts';
import { isCommonPassword, passwordProblem } from './passwords.ts';
import { safeNext } from './next-path.ts';

const EMAIL = 'asha.menon@example.in';

describe('code length', () => {
  it('is six digits, printed in two groups', () => {
    expect(OTP_LENGTH).toBe(6);
    expect(formatOtp('123456')).toBe('123 456');
  });

  it('knows the invalid_credentials error', () => {
    expect(ERROR_CODES).toContain('invalid_credentials');
  });
});

describe('password policy', () => {
  it('asks for 10 to 128 characters', () => {
    expect([PASSWORD_MIN, PASSWORD_MAX]).toEqual([10, 128]);
    expect(passwordProblem('nine char', EMAIL)).toMatch(/at least 10/);
    expect(passwordProblem('ten-chars!', EMAIL)).toBeNull();
    const words = 'river stone quiet '.repeat(8);
    expect(passwordProblem(words.slice(0, 128), EMAIL)).toBeNull();
    expect(passwordProblem(words.slice(0, 129), EMAIL)).toMatch(/128/);
  });

  it('has no composition rules: spaces, lower case only, and any script are fine', () => {
    expect(passwordProblem('river stone quiet morning', EMAIL)).toBeNull();
    expect(passwordProblem('nilavu mazhai kadal', EMAIL)).toBeNull();
    expect(passwordProblem('நிலவு மழை கடல் காற்று', EMAIL)).toBeNull();
  });

  it('counts characters, not UTF-16 units, so emoji are not double counted', () => {
    expect(passwordProblem('🌧️🌧️🌧️', EMAIL)).toMatch(/at least 10/);
    expect(passwordProblem('🌊'.repeat(10), EMAIL)).toMatch(/common|guess/);
    expect(passwordProblem('🌊🌧🌿🌙🌞🌼🌵🌲🌻🌴', EMAIL)).toBeNull();
    expect(passwordSchema.safeParse('🌊🌧🌿🌙🌞🌼🌵🌲🌻🌴').success).toBe(true);
  });

  it.each([
    'password123', 'Password@123', 'PASSWORD1234', '1234567890', '123456789012', 'qwertyuiop', 'qwerty123456', 'iloveyou123', 'iloveindia',
    'aaaaaaaaaaaa', 'abababababab', 'abcdefghijkl', '0987654321', 'welcome@123', 'india@12345', 'admin@12345', 'correct horse battery staple', 'P@ssw0rd2026',
  ])('rejects the common password %s', (common) => {
    expect(isCommonPassword(common)).toBe(true);
    expect(passwordProblem(common, EMAIL)).toMatch(/common|guess/);
  });

  it('does not treat an ordinary phrase as common', () => {
    expect(isCommonPassword('mango season on the terrace')).toBe(false);
  });

  it("rejects anything holding the address's local part, in any case", () => {
    expect(passwordProblem('xx-ASHA.MENON-xx-99', EMAIL)).toMatch(/email/);
    expect(passwordProblem('ravi-is-my-long-name', 'ravi+apps@example.com')).toMatch(/email/);
  });

  it('does not let a one or two letter local part rule out most passwords', () => {
    expect(passwordProblem('quiet river stone', 'a@example.com')).toBeNull();
    expect(passwordProblem('quiet river stone', 'te@example.com')).toBeNull();
  });
});

describe('password schemas', () => {
  it('never trims: leading and trailing spaces are part of the password', () => {
    expect(passwordSchema.parse('  ten chars here  ')).toBe('  ten chars here  ');
    expect(loginBody.parse({ email: EMAIL, password: ' pw ' }).password).toBe(' pw ');
  });

  it('login checks shape only, so that a rule added later cannot lock out an older password', () => {
    expect(loginBody.safeParse({ email: EMAIL, password: 'short' }).success).toBe(true);
    expect(loginBody.safeParse({ email: EMAIL, password: '' }).success).toBe(false);
  });

  it.each([
    ['registerVerifyBody', registerVerifyBody, { email: EMAIL, code: '123456', password: 'short' }],
    ['passwordResetBody', passwordResetBody, { email: EMAIL, code: '123456', password: 'short' }],
    ['passwordChangeBody', passwordChangeBody, { currentPassword: 'old', password: 'short' }],
  ] as const)('%s refuses a short password without repeating it', (_name, schema, body) => {
    const result = schema.safeParse(body);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).not.toContain('short"');
  });

  it('rejects unknown keys', () => {
    expect(loginBody.safeParse({ email: EMAIL, password: 'x', admin: true }).success).toBe(false);
  });
});

describe('safeNext, shared by the client and the server', () => {
  it.each([
    '/journal', '/result', '/journal/new?step=2', '/trends#x',
  ])('keeps the same-origin path %s', (path) => expect(safeNext(path)).toBe(path));

  it.each([
    'https://evil.example', '//evil.example', '///evil.example', '/\\evil.example', '\\\\evil.example', '/\t/evil.example', '/\n/evil.example',
    'javascript:alert(1)', 'journal', '', '/.//evil.example', '/x/..//evil.example', '/api/v1/auth/google/start', '/sign-in', '/sign-in/code', '/consent',
    '/create-account', '/create-account/code', '/forgot-password', '/forgot-password/reset', `/${'x'.repeat(2100)}`,
  ])('refuses %j', (path) => expect(safeNext(path)).toBe('/'));

  it('uses the given fallback', () => expect(safeNext(null, '/settings')).toBe('/settings'));
});
