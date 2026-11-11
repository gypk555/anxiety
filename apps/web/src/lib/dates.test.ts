import { describe, expect, it } from 'vitest';
import { formatLongDay } from './dates';

describe('formatLongDay', () => {
  it('names the weekday, day and month, for the line over the greeting', () => {
    expect(formatLongDay(new Date(2026, 10, 12))).toBe('Thursday, 12 November');
  });
});
