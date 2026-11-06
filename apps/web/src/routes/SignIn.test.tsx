import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queries';
import { mockFetch, problem, renderRoutes } from '@/test/render';
import { SignIn, SignInCode } from './SignIn';

const routes = [
  { path: '/sign-in', element: <SignIn /> },
  { path: '/sign-in/code', element: <SignInCode /> },
];

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('repeated wrong codes', () => {
  const start = async () => {
    mockFetch({ 'POST /auth/otp/request': { status: 202 }, 'POST /auth/otp/verify': problem(400, 'invalid_code') });
    renderRoutes(routes, '/sign-in', queryClient);
    await userEvent.type(await screen.findByLabelText('Email address'), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    return screen.findByLabelText('8-digit code');
  };
  const pause = /sign-in for this address can be paused for up to 24 hours/;

  it('the first failure is just the usual message', async () => {
    const box = await start();
    await userEvent.type(box, '00000000');
    expect(await screen.findByRole('alert')).toHaveTextContent("That code didn't work");
    expect(screen.queryByText(pause)).not.toBeInTheDocument();
  });

  it('after a second, it explains the pause, what still works, and is based only on what this screen saw', async () => {
    const box = await start();
    await userEvent.type(box, '00000000');
    await screen.findByRole('alert');
    await userEvent.type(box, '11111111');
    expect(await screen.findByText(pause)).toBeInTheDocument();
    expect(screen.getByText(/Devices already signed in keep working/)).toBeInTheDocument();
  });
});
