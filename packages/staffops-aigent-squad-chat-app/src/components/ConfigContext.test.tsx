import React from 'react';
import { render, screen } from '@testing-library/react';
import { ConfigProvider, useAppConfig } from './ConfigContext';
import { DEFAULT_CONFIG } from '../config';

function Probe() {
  const cfg = useAppConfig();
  return <div data-testid="probe">{`${cfg.model}|${cfg.thinkingIdleMs}`}</div>;
}

describe('ConfigContext', () => {
  it('returns DEFAULT_CONFIG when no provider is mounted', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe(
      `${DEFAULT_CONFIG.model}|${DEFAULT_CONFIG.thinkingIdleMs}`
    );
  });

  it('provides the supplied config value to consumers', () => {
    const value = { ...DEFAULT_CONFIG, model: 'large', thinkingIdleMs: 4200 };
    render(
      <ConfigProvider value={value}>
        <Probe />
      </ConfigProvider>
    );
    expect(screen.getByTestId('probe').textContent).toBe('large|4200');
  });
});
