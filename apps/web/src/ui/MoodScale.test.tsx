import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MoodScale } from './MoodScale';

const WORDS = ['Very low', 'Low', 'Okay', 'Good', 'Very good'];

describe('MoodScale', () => {
  it('renders five buttons in order with their words, in a group named by its question', () => {
    render(<MoodScale label="How are you today?" value={null} onChange={() => {}} />);
    const group = screen.getByRole('group', { name: 'How are you today?' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(WORDS);
  });

  it('marks only the chosen step pressed', () => {
    render(<MoodScale label="How are you today?" value={3} onChange={() => {}} />);
    const pressed = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((b) => b.textContent)).toEqual(['Okay']);
  });

  it("calls onChange with the step's rating", async () => {
    const onChange = vi.fn();
    render(<MoodScale label="How are you today?" value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Good' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('disabled stops choices', async () => {
    const onChange = vi.fn();
    render(<MoodScale label="How are you today?" value={null} onChange={onChange} disabled />);
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Low' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
