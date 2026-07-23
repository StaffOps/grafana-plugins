/**
 * Tests for reasoning.ts — tested against the contract, not the implementation:
 *  - splitReasoning separates a <think> block from the answer, handling the
 *    streaming (open block) and no-block cases.
 *  - parseTrace turns the raw tool-trace into structured tool/route/note entries,
 *    preserving unrecognized lines (nothing is silently dropped).
 */
import { splitReasoning, parseTrace } from './reasoning';

describe('splitReasoning', () => {
  it('returns the whole content as answer when there is no <think> block', () => {
    const r = splitReasoning('just a plain answer');
    expect(r).toEqual({ reasoning: '', answer: 'just a plain answer', open: false });
  });

  it('splits a closed <think> block into reasoning and answer', () => {
    const r = splitReasoning('<think>\n🔧 tool trace\n</think>\nThe final answer.');
    expect(r.reasoning).toBe('🔧 tool trace');
    expect(r.answer).toBe('The final answer.');
    expect(r.open).toBe(false);
  });

  it('marks the block open while <think> has no closing tag yet (streaming)', () => {
    const r = splitReasoning('<think>\n🔧 still working');
    expect(r.open).toBe(true);
    expect(r.reasoning).toBe('🔧 still working');
    expect(r.answer).toBe('');
  });

  it('preserves text before the <think> block as part of the answer', () => {
    const r = splitReasoning('prefix <think>trace</think> suffix');
    expect(r.reasoning).toBe('trace');
    expect(r.answer).toBe('prefix  suffix');
    expect(r.open).toBe(false);
  });

  it('handles an empty think block', () => {
    const r = splitReasoning('<think></think>answer');
    expect(r.reasoning).toBe('');
    expect(r.answer).toBe('answer');
  });

  it('handles empty input', () => {
    expect(splitReasoning('')).toEqual({ reasoning: '', answer: '', open: false });
  });
});

describe('parseTrace', () => {
  it('parses routing, tool calls and builds a compact summary', () => {
    const raw = [
      '🔧 Tool trace',
      '',
      '🧭 Routed to **observability** (confidence 95%)',
      "🔧 metrics(match='{service_name=\"X\"}', limit=50)",
      '📦 49 items',
      "🔧 query(query='sum(rate(...))', tenant='0')",
      '📦 ok',
    ].join('\n');

    const t = parseTrace(raw);

    expect(t.routedTo).toBe('observability');
    expect(t.confidence).toBe('95%');
    // route entry + 2 tool entries (Tool trace header dropped)
    expect(t.calls.filter((c) => c.kind === 'tool')).toEqual([
      { kind: 'tool', tool: 'metrics', result: '49 items' },
      { kind: 'tool', tool: 'query', result: 'ok' },
    ]);
    expect(t.calls.some((c) => c.kind === 'route')).toBe(true);
    expect(t.summary).toBe('observability (95%) · metrics · query');
  });

  it('aggregates repeated tools with a count in the summary', () => {
    const raw = [
      "🔧 query(query='a')",
      '📦 ok',
      "🔧 query(query='b')",
      '📦 ok',
      "🔧 query(query='c')",
      '📦 ok',
    ].join('\n');

    const t = parseTrace(raw);
    expect(t.summary).toBe('3× query');
    expect(t.calls.filter((c) => c.kind === 'tool')).toHaveLength(3);
  });

  it('handles a tool call with an inline result on the same line', () => {
    const t = parseTrace("🔧 series(match='{x}') 📦 3 items");
    expect(t.calls).toContainEqual({ kind: 'tool', tool: 'series', result: '3 items' });
  });

  it("defaults a tool result to 'ok' when no 📦 line follows", () => {
    const t = parseTrace("🔧 query(query='x')\n🔧 label_values(label_name='y')\n📦 5 items");
    const tools = t.calls.filter((c) => c.kind === 'tool');
    expect(tools[0]).toEqual({ kind: 'tool', tool: 'query', result: 'ok' });
    expect(tools[1]).toEqual({ kind: 'tool', tool: 'label_values', result: '5 items' });
  });

  it('preserves unrecognized lines as notes (nothing is dropped)', () => {
    const raw = [
      '🧭 Routed to kubernetes (confidence 80%)',
      '💭 Analyzing latency patterns before querying',
      "🔧 query(query='x')",
      '📦 ok',
    ].join('\n');

    const t = parseTrace(raw);
    expect(t.calls).toContainEqual({
      kind: 'note',
      tool: '',
      result: '💭 Analyzing latency patterns before querying',
    });
  });

  it('drops the fixed "🔧 Tool trace" header', () => {
    const t = parseTrace('🔧 Tool trace\n📦 ignored-orphan');
    // header dropped; the orphan 📦 line (no pending tool) is preserved as a note
    expect(t.calls.every((c) => c.tool !== 'Tool')).toBe(true);
  });

  it('returns an empty structure for empty reasoning', () => {
    const t = parseTrace('');
    expect(t).toEqual({ routedTo: undefined, confidence: undefined, calls: [], summary: '' });
  });

  it('builds a summary from routing alone when there are no tool calls', () => {
    const t = parseTrace('🧭 Routed to finops (confidence 70%)');
    expect(t.summary).toBe('finops (70%)');
  });
});
