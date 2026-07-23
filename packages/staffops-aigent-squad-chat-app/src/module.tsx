import React, { Suspense, lazy } from 'react';
import { AppPlugin, type AppRootProps } from '@grafana/data';
import { LoadingPlaceholder } from '@grafana/ui';
import type { AppConfigJsonData } from './config';
import { AppConfig } from './components/AppConfig';

const LazyApp = lazy(() => import('./components/App/App'));

const App = (props: AppRootProps) => (
  <Suspense fallback={<LoadingPlaceholder text="" />}>
    <LazyApp {...props} />
  </Suspense>
);

// AIgent Squad talks to the LLM app (Option A); the provider (URL + token) lives in the
// Grafana LLM app settings, never in this plugin. The config page below only exposes
// plugin-level UI/behaviour knobs (model, source tag, timeouts, reasoning default).
export const plugin = new AppPlugin<AppConfigJsonData>()
  .setRootPage(App)
  .addConfigPage({
    title: 'Configuration',
    icon: 'cog',
    body: AppConfig,
    id: 'configuration',
  });
