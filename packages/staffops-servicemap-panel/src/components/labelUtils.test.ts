import { truncateLabel, labelYOffset, DEFAULT_LABEL_MAX_CHARS } from './labelUtils';

describe('truncateLabel', () => {
  it('returns the original string when shorter than maxChars', () => {
    expect(truncateLabel('short')).toBe('short');
  });

  it('returns the original string when exactly maxChars', () => {
    const exact = 'a'.repeat(DEFAULT_LABEL_MAX_CHARS);
    expect(truncateLabel(exact)).toBe(exact);
  });

  it('truncates and appends ellipsis when longer than maxChars', () => {
    const long = 'dcp-cosmeticresellers-api-btc';
    const result = truncateLabel(long);
    expect(result).toBe('dcp-cosmeticrese…');
    expect(result.length).toBe(DEFAULT_LABEL_MAX_CHARS + 1); // 16 chars + ellipsis char
  });

  it('respects custom maxChars parameter', () => {
    expect(truncateLabel('hello-world', 5)).toBe('hello…');
  });

  it('handles empty string', () => {
    expect(truncateLabel('')).toBe('');
  });

  it('handles string of length 1', () => {
    expect(truncateLabel('x')).toBe('x');
  });
});

describe('labelYOffset', () => {
  it('returns base offset for even-indexed nodes', () => {
    expect(labelYOffset(0)).toBe(14);
    expect(labelYOffset(2)).toBe(14);
    expect(labelYOffset(4)).toBe(14);
  });

  it('returns base + stagger for odd-indexed nodes', () => {
    expect(labelYOffset(1)).toBe(14 + 12);
    expect(labelYOffset(3)).toBe(14 + 12);
    expect(labelYOffset(5)).toBe(14 + 12);
  });

  it('accepts custom base offset and stagger amount', () => {
    expect(labelYOffset(0, 10, 8)).toBe(10);
    expect(labelYOffset(1, 10, 8)).toBe(18);
  });
});
