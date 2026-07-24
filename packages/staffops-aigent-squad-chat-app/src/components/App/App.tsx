import React from 'react';
import type { AppRootProps } from '@grafana/data';
import { ChatPage } from '../ChatPage';
import { ConfigProvider } from '../ConfigContext';
import { resolveConfig, type AppConfigJsonData } from '../../config';

function App(props: AppRootProps) {
  const config = resolveConfig(props.meta?.jsonData as AppConfigJsonData | undefined);
  return (
    <ConfigProvider value={config}>
      <ChatPage />
    </ConfigProvider>
  );
}

export default App;
