import { llm } from '@grafana/llm';

/**
 * Plugin-level configuration, editable from the plugin's Configuration page
 * (Administration → Plugins → AIgent Squad Chat → Configuration) and persisted
 * in the plugin's `jsonData`. The provider URL + token do NOT live here — those
 * stay in the Grafana LLM app (Option A). These are UI/behaviour knobs only.
 */
export interface AppConfig {
  /** Model requested from the LLM app. AIgent Squad routes by context, so this
   *  mostly selects the LLM app's abstract model slot (base/large). */
  model: string;
  /** Prefix added to the latest user message so the squad can filter/audit
   *  requests coming from this plugin. */
  sourceTag: string;
  /** Idle window (ms) before switching the UI to the "thinking" indicator. */
  thinkingIdleMs: number;
  /** Hard idle cap (ms): surface an error if no chunk of any kind arrives. */
  maxStreamIdleMs: number;
  /** Whether the tool-trace / reasoning panel starts expanded. */
  reasoningDefaultOpen: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  model: llm.Model.BASE,
  sourceTag: '[source:grafana-plugin/aigent-squad-chat]',
  thinkingIdleMs: 3_000,
  maxStreamIdleMs: 120_000,
  reasoningDefaultOpen: false,
};

/** Shape persisted in plugin jsonData — every field optional (partial overrides). */
export type AppConfigJsonData = Partial<AppConfig>;

/**
 * Merge persisted jsonData over the defaults, coercing/validating each field so a
 * malformed stored value can never break the UI (falls back to the default).
 */
export function resolveConfig(jsonData: AppConfigJsonData | undefined): AppConfig {
  const j = jsonData ?? {};
  const positiveInt = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;

  return {
    model: typeof j.model === 'string' && j.model.trim() ? j.model.trim() : DEFAULT_CONFIG.model,
    sourceTag: typeof j.sourceTag === 'string' ? j.sourceTag : DEFAULT_CONFIG.sourceTag,
    thinkingIdleMs: positiveInt(j.thinkingIdleMs, DEFAULT_CONFIG.thinkingIdleMs),
    maxStreamIdleMs: positiveInt(j.maxStreamIdleMs, DEFAULT_CONFIG.maxStreamIdleMs),
    reasoningDefaultOpen:
      typeof j.reasoningDefaultOpen === 'boolean'
        ? j.reasoningDefaultOpen
        : DEFAULT_CONFIG.reasoningDefaultOpen,
  };
}
