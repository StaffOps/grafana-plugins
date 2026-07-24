import React from 'react';
import { PluginPage } from '@grafana/runtime';
import { AvailabilityGate } from './AvailabilityGate';
import { Conversation } from './Conversation';

export function ChatPage() {
  return (
    <PluginPage>
      <AvailabilityGate>
        <Conversation />
      </AvailabilityGate>
    </PluginPage>
  );
}
