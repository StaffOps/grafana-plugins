/**
 * AIgent Squad wraps its tool-trace / reasoning in a `<think>…</think>` block
 * (the reasoning-model convention, e.g. DeepSeek-R1) and then emits the final
 * answer after the closing tag. The raw stream looks like:
 *
 *   <think>
 *   🧭 Routed to observability (confidence 95%)
 *   🔧 label_values(label_name='service')  📦 706 items
 *   …
 *   </think>
 *   The service DataPlatform.People in prd shows p95 latency of …
 *
 * Rendering that verbatim dumps the whole trace into the answer bubble. We split
 * it so the UI can show the reasoning in a collapsible panel and the answer as
 * the main message.
 */
export interface SplitReasoning {
  /** Content inside the `<think>` block (the tool trace / reasoning). */
  reasoning: string;
  /** The user-facing answer (everything outside the think block). */
  answer: string;
  /** True while a `<think>` block is open but not yet closed (still reasoning). */
  open: boolean;
}

const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';

/**
 * Split streamed assistant content into its reasoning block and the answer.
 *
 * Handles the streaming case: while the `<think>` block is still open (no
 * `</think>` yet), everything after `<think>` is reasoning-in-progress and the
 * answer is empty. Content with no `<think>` tag is treated entirely as answer
 * (backward-compatible with providers that don't emit reasoning).
 */
export function splitReasoning(content: string): SplitReasoning {
  const openIdx = content.indexOf(OPEN_TAG);
  if (openIdx === -1) {
    return { reasoning: '', answer: content, open: false };
  }

  const afterOpen = openIdx + OPEN_TAG.length;
  const closeIdx = content.indexOf(CLOSE_TAG, afterOpen);

  // Text before the think block (rare, but preserve it) plus text after the
  // close tag both belong to the answer.
  const before = content.slice(0, openIdx);

  if (closeIdx === -1) {
    // Still reasoning — no answer yet.
    return {
      reasoning: content.slice(afterOpen).trim(),
      answer: before.trim(),
      open: true,
    };
  }

  const reasoning = content.slice(afterOpen, closeIdx).trim();
  const after = content.slice(closeIdx + CLOSE_TAG.length);
  const answer = `${before}${after}`.trim();

  return { reasoning, answer, open: false };
}

/** A single parsed entry from the trace. */
export interface TraceCall {
  /** Entry kind: a tool invocation, the routing decision, or free-text note. */
  kind: 'tool' | 'route' | 'note';
  /** Tool name (kind='tool') or a short label; empty for notes. */
  tool: string;
  /** Result text (kind='tool') or the raw line (kind='note'/'route'). */
  result: string;
}

export interface ParsedTrace {
  /** e.g. "observability" — the specialist the classifier routed to. */
  routedTo?: string;
  /** Routing confidence, e.g. "95%". */
  confidence?: string;
  /** One entry per trace line: tool calls, routing, and preserved notes. */
  calls: TraceCall[];
  /** One-line human summary, e.g. "observability · 24 queries · 2 lookups". */
  summary: string;
}

const ROUTE_RE = /Routed to \*{0,2}([\w-]+)\*{0,2}\s*\(confidence\s*([^)]+)\)/i;
const TOOL_RE = /^🔧\s*([a-zA-Z_]+)\s*\(/;
const RESULT_RE = /^📦\s*(.+)$/;
/** The literal header the squad prepends to every trace — noise, drop it. */
const TRACE_HEADER_RE = /^🔧\s*Tool trace\s*$/i;

/**
 * Parse AIgent Squad's raw tool-trace into a structured, UI-friendly form.
 * The raw trace is a wall of `🔧 tool(verbose args…)` / `📦 result` lines; this
 * drops the verbose query args, pairs each tool with its result, and builds a
 * compact one-line summary.
 *
 * Robustness: any line that is NOT a recognized tool/result/route pattern is
 * preserved as a `note` entry rather than silently dropped, so if the squad
 * starts emitting free-text reasoning or a new format, it still surfaces in the
 * panel instead of vanishing. Only the fixed "🔧 Tool trace" header is dropped.
 */
export function parseTrace(reasoning: string): ParsedTrace {
  const lines = reasoning.split('\n').map((l) => l.trim()).filter(Boolean);

  let routedTo: string | undefined;
  let confidence: string | undefined;
  const calls: TraceCall[] = [];
  let pendingTool: string | undefined;

  const flushPending = () => {
    if (pendingTool) {
      calls.push({ kind: 'tool', tool: pendingTool, result: 'ok' });
      pendingTool = undefined;
    }
  };

  for (const line of lines) {
    if (TRACE_HEADER_RE.test(line)) {
      continue;
    }
    const route = line.match(ROUTE_RE);
    if (route) {
      flushPending();
      routedTo = route[1];
      confidence = route[2].trim();
      calls.push({ kind: 'route', tool: '', result: `Routed to ${routedTo} (${confidence})` });
      continue;
    }
    const tool = line.match(TOOL_RE);
    if (tool) {
      flushPending();
      pendingTool = tool[1];
      const inline = line.match(/📦\s*(.+)$/);
      if (inline) {
        calls.push({ kind: 'tool', tool: pendingTool, result: inline[1].trim() });
        pendingTool = undefined;
      }
      continue;
    }
    const result = line.match(RESULT_RE);
    if (result && pendingTool) {
      calls.push({ kind: 'tool', tool: pendingTool, result: result[1].trim() });
      pendingTool = undefined;
      continue;
    }
    // Unrecognized line — preserve it as a note so nothing is lost.
    flushPending();
    calls.push({ kind: 'note', tool: '', result: line });
  }
  flushPending();

  // Build a compact summary from routing + tool counts (notes excluded).
  const counts = new Map<string, number>();
  for (const c of calls) {
    if (c.kind === 'tool') {
      counts.set(c.tool, (counts.get(c.tool) ?? 0) + 1);
    }
  }
  const parts: string[] = [];
  if (routedTo) {
    parts.push(confidence ? `${routedTo} (${confidence})` : routedTo);
  }
  for (const [tool, n] of counts) {
    parts.push(n > 1 ? `${n}× ${tool}` : tool);
  }
  const summary = parts.join(' · ');

  return { routedTo, confidence, calls, summary };
}

