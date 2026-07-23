import React, { createContext, useContext } from 'react';
import { type AppConfig, DEFAULT_CONFIG } from '../config';

const ConfigContext = createContext<AppConfig>(DEFAULT_CONFIG);

/**
 * Access the resolved plugin config. Returns DEFAULT_CONFIG when no provider is
 * mounted (e.g. unit tests rendering a component in isolation), so consumers
 * never need a null check.
 */
export function useAppConfig(): AppConfig {
  return useContext(ConfigContext);
}

export function ConfigProvider({
  value,
  children,
}: {
  value: AppConfig;
  children: React.ReactNode;
}) {
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}
