/**
 * Tests for AvailabilityGate — tested against contract:
 *  - loading -> shows loading placeholder
 *  - enabled=false -> 'not available' warning (testId gate-disabled)
 *  - enabled() rejects -> error alert (testId gate-error)
 *  - enabled=true -> renders children
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AvailabilityGate } from '../components/AvailabilityGate';
import { __mockEnabled } from '@grafana/llm';
import { testIds } from '../components/testIds';

jest.mock('@grafana/llm');
jest.mock('@grafana/ui');

describe('AvailabilityGate', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading placeholder while enabled() is pending', () => {
    // Never resolve — hangs in loading state
    __mockEnabled.mockReturnValue(new Promise(() => {}));

    render(
      <AvailabilityGate>
        <div data-testid="child">OK</div>
      </AvailabilityGate>
    );

    expect(screen.getByTestId(testIds.gate.loading)).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('shows warning when enabled() resolves false', async () => {
    __mockEnabled.mockResolvedValue(false);

    render(
      <AvailabilityGate>
        <div data-testid="child">OK</div>
      </AvailabilityGate>
    );

    await waitFor(() => {
      expect(screen.getByTestId(testIds.gate.disabled)).toBeInTheDocument();
    });

    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('shows error alert when enabled() rejects', async () => {
    __mockEnabled.mockRejectedValue(new Error('Connection refused'));

    render(
      <AvailabilityGate>
        <div data-testid="child">OK</div>
      </AvailabilityGate>
    );

    await waitFor(() => {
      expect(screen.getByTestId(testIds.gate.error)).toBeInTheDocument();
    });

    expect(screen.getByText('Connection refused')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('renders children when enabled() resolves true', async () => {
    __mockEnabled.mockResolvedValue(true);

    render(
      <AvailabilityGate>
        <div data-testid="child">OK</div>
      </AvailabilityGate>
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    expect(screen.queryByTestId(testIds.gate.loading)).not.toBeInTheDocument();
    expect(screen.queryByTestId(testIds.gate.disabled)).not.toBeInTheDocument();
    expect(screen.queryByTestId(testIds.gate.error)).not.toBeInTheDocument();
  });
});
