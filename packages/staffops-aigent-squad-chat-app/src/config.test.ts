import { resolveConfig, DEFAULT_CONFIG } from './config';

describe('resolveConfig', () => {
  it('returns defaults for undefined jsonData', () => {
    expect(resolveConfig(undefined)).toEqual(DEFAULT_CONFIG);
  });

  it('returns defaults for empty jsonData', () => {
    expect(resolveConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('applies valid overrides', () => {
    const cfg = resolveConfig({
      model: 'large',
      sourceTag: '[custom]',
      thinkingIdleMs: 5000,
      maxStreamIdleMs: 60000,
      reasoningDefaultOpen: true,
    });
    expect(cfg).toEqual({
      model: 'large',
      sourceTag: '[custom]',
      thinkingIdleMs: 5000,
      maxStreamIdleMs: 60000,
      reasoningDefaultOpen: true,
    });
  });

  it('allows an empty source tag (disables the prefix)', () => {
    expect(resolveConfig({ sourceTag: '' }).sourceTag).toBe('');
  });

  it('trims and falls back for a blank model', () => {
    expect(resolveConfig({ model: '   ' }).model).toBe(DEFAULT_CONFIG.model);
    expect(resolveConfig({ model: ' large ' }).model).toBe('large');
  });

  it('coerces invalid numeric fields back to defaults', () => {
    const cfg = resolveConfig({
      // @ts-expect-error — simulate malformed stored data
      thinkingIdleMs: 'nope',
      maxStreamIdleMs: -5,
    });
    expect(cfg.thinkingIdleMs).toBe(DEFAULT_CONFIG.thinkingIdleMs);
    expect(cfg.maxStreamIdleMs).toBe(DEFAULT_CONFIG.maxStreamIdleMs);
  });

  it('ignores a non-boolean reasoningDefaultOpen', () => {
    // @ts-expect-error — simulate malformed stored data
    expect(resolveConfig({ reasoningDefaultOpen: 'yes' }).reasoningDefaultOpen).toBe(false);
  });
});
