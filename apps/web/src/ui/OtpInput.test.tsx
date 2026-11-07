import { OTP_LENGTH } from '@anxiocare/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanCode, OtpInput } from './OtpInput';

function Harness({ onComplete }: { onComplete: (c: string) => void }) {
  const [value, setValue] = useState('');
  return <OtpInput value={value} onChange={setValue} onComplete={onComplete} />;
}

describe('OtpInput', () => {
  it('is set up for mobile keyboards and one-time-code autofill', () => {
    render(<Harness onComplete={() => {}} />);
    const input = screen.getByLabelText('6-digit code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('completes after six typed digits, ignoring letters', async () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    await userEvent.type(screen.getByLabelText('6-digit code'), '12a3');
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByLabelText('6-digit code')).toHaveValue('123');
    await userEvent.type(screen.getByLabelText('6-digit code'), '456');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('123456');
  });

  it('accepts a paste with spaces or surrounding words', async () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    await userEvent.click(screen.getByLabelText('6-digit code'));
    await userEvent.paste('Code: 9876 5432');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('987654');
  });

  it('cleans codes', () => {
    expect(cleanCode(' 12-34 56 78 90 12')).toBe('123456');
  });

  it('takes a code pasted out of a whole sentence, however long', async () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    await userEvent.click(screen.getByLabelText('6-digit code'));
    await userEvent.paste('Use this code to sign in. 123 456 It expires in 10 minutes.');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('123456');
  });

  it('draws one box per digit from the shared length', () => {
    const { container } = render(<Harness onComplete={() => {}} />);
    expect(container.querySelectorAll('[data-otp-box]')).toHaveLength(OTP_LENGTH);
  });
});
