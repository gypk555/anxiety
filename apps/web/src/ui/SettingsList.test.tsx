import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyRound, Mail } from 'lucide-react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SettingsGroup, SettingsRow } from './SettingsList';

const inRouter = (ui: React.ReactNode) => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: ui }])} />);

describe('settings list', () => {
  it('a row with onClick is a button named by its title, described by its value', async () => {
    const onClick = vi.fn();
    inRouter(<SettingsGroup id="g" title="Sign-in and security"><SettingsRow icon={KeyRound} title="Password" value="Set" onClick={onClick} /></SettingsGroup>);
    const row = screen.getByRole('button', { name: 'Password' });
    expect(row).toHaveAccessibleDescription('Set');
    await userEvent.click(row);
    expect(onClick).toHaveBeenCalled();
  });

  it('a row with to is a link', () => {
    inRouter(<SettingsGroup id="g" title="About"><SettingsRow icon={Mail} title="Privacy notice" to="/privacy" /></SettingsGroup>);
    expect(screen.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute('href', '/privacy');
  });

  it('a row with neither is static text, with no chevron', () => {
    const { container } = inRouter(<SettingsGroup id="g" title="Security"><SettingsRow icon={Mail} title="Email codes" value="Always on" /></SettingsGroup>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Always on')).toBeInTheDocument();
    expect(container.querySelector('.lucide-chevron-right')).toBeNull();
  });

  it('a group is a region named by its title, with no divider lines between rows', () => {
    const { container } = inRouter(
      <SettingsGroup id="g" title="Account">
        <SettingsRow icon={Mail} title="Name" onClick={() => {}} />
        <SettingsRow icon={Mail} title="Email" onClick={() => {}} />
      </SettingsGroup>,
    );
    const region = screen.getByRole('region', { name: 'Account' });
    expect(region.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('hr, .stitch-rule')).toBeNull();
  });
});
