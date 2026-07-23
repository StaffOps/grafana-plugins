export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * idle      — no active stream.
 * streaming — assistant tokens are arriving.
 * thinking  — stream is open but no content chunk for a while (AIgent Squad is
 *             running a tool server-side; see design.md "agentic streaming behavior").
 * error     — the stream failed or timed out; any partial content stays visible.
 */
export type StreamStatus = 'idle' | 'streaming' | 'thinking' | 'error';
