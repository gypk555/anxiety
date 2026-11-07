import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TrendChart, trendSummary } from './TrendChart';

const POINTS = [
  { id: 'a', takenAt: '2026-10-01T10:00:00.000Z', score: 16 },
  { id: 'b', takenAt: '2026-10-15T10:00:00.000Z', score: 12 },
  { id: 'c', takenAt: '2026-11-01T10:00:00.000Z', score: 12 },
];

describe('TrendChart', () => {
  it('exposes the picture as one labelled image, with the numbers in words', () => {
    render(<TrendChart points={POINTS} />);
    const img = screen.getByRole('img');
    const labelled = img.getAttribute('aria-labelledby')!.split(' ');
    expect(labelled).toHaveLength(2);
    expect(document.getElementById(labelled[0]!)).toHaveTextContent(/scores over time/);
    expect(document.getElementById(labelled[1]!)).toHaveTextContent(/latest score is 12 out of 21, moderate/);
  });

  it('offers the same data as a real table, newest first', async () => {
    render(<TrendChart points={POINTS} />);
    const toggle = screen.getByRole('button', { name: 'Show these as a table' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(rows[3]).toHaveTextContent('16');
    expect(rows[3]).toHaveTextContent('Severe');
    expect(screen.getByRole('button', { name: 'Hide the table' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('labels the bands in words, never colour alone', () => {
    render(<TrendChart points={POINTS} />);
    const svg = screen.getByRole('img');
    for (const label of ['Minimal', 'Mild', 'Moderate', 'Severe']) expect(svg).toHaveTextContent(label);
  });

  it('states change neutrally', () => {
    expect(trendSummary(POINTS)).toMatch(/the same as your check-in/);
    expect(trendSummary(POINTS.slice(0, 2))).toMatch(/4 lower than/);
    expect(trendSummary([...POINTS].reverse().slice(1))).toMatch(/4 higher than/);
    expect(trendSummary(POINTS)).not.toMatch(/improv|better|worse|great|well done/i);
  });

  it('copes with a single check-in and none', () => {
    render(<TrendChart points={POINTS.slice(0, 1)} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(trendSummary([])).toBe('No check-ins yet.');
  });
});
