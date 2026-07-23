import React, { useState } from 'react';
import { css } from '@emotion/css';
import { getBackendSrv } from '@grafana/runtime';
import type { AppPluginMeta, GrafanaTheme2, PluginConfigPageProps } from '@grafana/data';
import { Button, Field, Input, Switch, useStyles2 } from '@grafana/ui';
import { resolveConfig, type AppConfig, type AppConfigJsonData } from '../config';
import { testIds } from './testIds';

type Props = PluginConfigPageProps<AppPluginMeta<AppConfigJsonData>>;

/**
 * Persist the plugin's jsonData via the Grafana plugin-settings API. The provider
 * URL/token are NOT here — they live in the Grafana LLM app (Option A). These are
 * behaviour knobs stored in this plugin's own jsonData.
 */
async function savePluginSettings(pluginId: string, jsonData: AppConfigJsonData): Promise<void> {
  await getBackendSrv().post(`/api/plugins/${pluginId}/settings`, {
    enabled: true,
    pinned: true,
    jsonData,
  });
  // Reload so the new settings take effect across the app.
  window.location.reload();
}

export function AppConfig({ plugin }: Props) {
  const styles = useStyles2(getStyles);
  const current = resolveConfig(plugin.meta.jsonData);
  const [cfg, setCfg] = useState<AppConfig>(current);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: value }));

  const onSave = async () => {
    setSaving(true);
    try {
      await savePluginSettings(plugin.meta.id, cfg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <Field label="Model" description="Model slot requested from the Grafana LLM app (AIgent Squad routes by context).">
        <Input
          value={cfg.model}
          onChange={(e) => set('model', e.currentTarget.value)}
          data-testid={testIds.config.model}
        />
      </Field>

      <Field label="Source tag" description="Prefix added to the latest user message so the squad can filter/audit plugin requests. Leave empty to disable.">
        <Input
          value={cfg.sourceTag}
          onChange={(e) => set('sourceTag', e.currentTarget.value)}
          data-testid={testIds.config.sourceTag}
        />
      </Field>

      <Field label="Thinking indicator delay (ms)" description="Idle time before showing the 'working…' indicator.">
        <Input
          type="number"
          value={cfg.thinkingIdleMs}
          onChange={(e) => set('thinkingIdleMs', Number(e.currentTarget.value))}
          data-testid={testIds.config.thinkingIdle}
        />
      </Field>

      <Field label="Max stream idle (ms)" description="Hard timeout: error if no chunk of any kind arrives within this window.">
        <Input
          type="number"
          value={cfg.maxStreamIdleMs}
          onChange={(e) => set('maxStreamIdleMs', Number(e.currentTarget.value))}
          data-testid={testIds.config.maxIdle}
        />
      </Field>

      <Field label="Expand tool trace by default" description="Whether the reasoning / tool-trace panel starts expanded.">
        <Switch
          value={cfg.reasoningDefaultOpen}
          onChange={(e) => set('reasoningDefaultOpen', e.currentTarget.checked)}
          data-testid={testIds.config.reasoningOpen}
        />
      </Field>

      <Button onClick={onSave} disabled={saving} data-testid={testIds.config.save}>
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  );
}

// Exported for testing the persistence path in isolation.
export const __test = { savePluginSettings };

const getStyles = (theme: GrafanaTheme2) => ({
  container: css({
    maxWidth: '600px',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    marginTop: theme.spacing(2),
  }),
});
