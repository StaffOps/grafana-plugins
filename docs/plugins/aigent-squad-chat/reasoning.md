# AIgent Squad Chat — Reasoning & Trace

AIgent Squad wraps its tool-trace / reasoning in a `<think>…</think>` block (the
reasoning-model convention) and emits the final answer after the closing tag:

```
<think>
🧭 Routed to observability (confidence 95%)
🔧 query(query='histogram_quantile(0.95, …)', tenant='0')
📦 ok
…
</think>
The p95 latency for DataPlatform.People in prd is …
```

Rendering that verbatim would dump the whole trace into the answer bubble. The plugin
(`src/llm/reasoning.ts`) splits and structures it instead.

## `splitReasoning`

Separates the `<think>` block from the answer. Handles:

- **No block** → the whole content is the answer (backward-compatible).
- **Open block (streaming)** → everything after `<think>` is reasoning-in-progress; the
  answer is empty until `</think>` arrives.
- **Closed block** → reasoning is the inner text; the answer is everything outside.

## `parseTrace`

Turns the raw trace into a compact structure:

- **Routing** — `🧭 Routed to <specialist> (confidence N%)`.
- **Tool calls** — one clean `tool → result` entry each; the verbose query args are dropped.
- **Summary** — a one-line header, e.g. `observability (95%) · 2× metrics · 25× query`.

### Robustness — nothing is dropped

Any trace line that is **not** a recognized tool / result / route pattern is preserved as a
`note` entry rather than silently discarded. If the squad starts emitting free-text
reasoning or a new trace format, it still surfaces in the panel — no plugin change needed.
Only the fixed `🔧 Tool trace` header is dropped as noise.

## Rendering

- The **answer** renders as sanitized markdown (`renderMarkdown` — marked + XSS sanitizer).
- The **trace** renders in a **collapsed-by-default** `<details>` panel (scrollable,
  monospace). The `Expand tool trace by default` setting controls the initial state.
- Markdown containment: code blocks, tables and lists are constrained to the bubble
  (`min-width: 0`, `overflow: hidden`, list padding) so nothing bleeds outside.

## Tests

`splitReasoning` and `parseTrace` are covered by unit tests (`src/llm/reasoning.test.ts`)
including the streaming (open-block), no-block, inline-result, aggregation, and
note-preservation cases. Overall plugin coverage is ~99% lines.
