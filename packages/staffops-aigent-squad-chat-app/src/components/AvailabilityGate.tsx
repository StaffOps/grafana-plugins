import React, { useEffect, useState } from 'react';
import { llm } from '@grafana/llm';
import { Alert, LoadingPlaceholder } from '@grafana/ui';
import { testIds } from './testIds';

interface Props {
  children: React.ReactNode;
}

interface GateState {
  loading: boolean;
  enabled: boolean;
  error?: string;
}

/**
 * Blocks the chat UI until the Grafana LLM app is confirmed available. Every LLM call in
 * the app is preceded by this check (design.md invariant) so the plugin degrades
 * gracefully when the LLM app is missing or has no provider configured.
 */
export function AvailabilityGate({ children }: Props) {
  const [state, setState] = useState<GateState>({ loading: true, enabled: false });

  useEffect(() => {
    let active = true;
    llm
      .enabled()
      .then((enabled) => active && setState({ loading: false, enabled }))
      .catch((e: Error) => active && setState({ loading: false, enabled: false, error: e?.message }));
    return () => {
      active = false;
    };
  }, []);

  if (state.loading) {
    return <LoadingPlaceholder text="Checking AIgent Squad availability…" data-testid={testIds.gate.loading} />;
  }

  if (state.error) {
    return (
      <Alert title="Could not reach the Grafana LLM app" severity="error" data-testid={testIds.gate.error}>
        {state.error}
      </Alert>
    );
  }

  if (!state.enabled) {
    return (
      <Alert title="AIgent Squad is not available" severity="warning" data-testid={testIds.gate.disabled}>
        The Grafana LLM app is not enabled, or no provider is configured. Ask an administrator to
        configure the AIgent Squad provider in the Grafana LLM app settings.
      </Alert>
    );
  }

  return <>{children}</>;
}
