import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { moodSummary } from '@/lib/mood';
import { MoodChart } from './MoodChart';

const at = '2026-11-01T04:00:00.000Z';
const ENTRIES = [
  { day: '2026-11-01', rating: 2, note: 'Tired', createdAt: at, updatedAt: at },
  { day: '2026-11-03', rating: 4, note: '', createdAt: at, updatedAt: at },
  { day: '2026-11-04', rating: 3, note: '', createdAt: at, updatedAt: at },
];

describe('MoodChart', () => {
  it('is clearly its own thing: the daily mood log, not a test score', () => {
    render(<MoodChart entries={ENTRIES} from="2026-10-06" to="2026-11-04" />);
    expect(screen.getByRole('heading', { name: 'Your daily mood log, not a test score' })).toBeInTheDocument();
    const img = screen.getByRole('img');
    const [title, desc] = img.getAttribute('aria-labelledby')!.split(' ');
    expect(document.getElementById(title!)).toHaveTextContent(/daily mood/i);
    expect(document.getElementById(title!)).not.toHaveTextContent(/score|GAD/i);
    expect(document.getElementById(desc!)).toHaveTextContent('3 days logged');
  });

  it('labels its axis in words, from Very low to Very good', () => {
    render(<MoodChart entries={ENTRIES} from="2026-10-06" to="2026-11-04" />);
    const svg = screen.getByRole('img');
    for (const word of ['Very low', 'Low', 'Okay', 'Good', 'Very good']) expect(svg).toHaveTextContent(word);
    expect(svg).not.toHaveTextContent(/Minimal|Moderate|Severe/);
  });

  it('offers a table alternative, newest first, with the words', async () => {
    render(<MoodChart entries={ENTRIES} from="2026-10-06" to="2026-11-04" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show the mood log as a table' }));
    const rows = within(screen.getByRole('table', { name: 'Daily mood by date' })).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent('Okay');
    expect(rows[3]).toHaveTextContent('Low');
    expect(rows[3]).toHaveTextContent('Tired');
  });

  it('summarises without judgement', () => {
    expect(moodSummary([])).toBe('No days logged in this period.');
    expect(moodSummary(ENTRIES)).toBe('3 days logged. The most recent, on 4 Nov 2026, was Okay.');
  });
});
