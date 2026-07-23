/**
 * Tests for useChatStream hook — tested against the CONTRACT:
 *  - send() appends user turn, starts stream, emits 'streaming' status
 *  - complete commits assistant turn, clears streaming, returns to idle
 *  - multi-turn resends full history
 *  - 3s idle -> status 'thinking'
 *  - 120s hard idle -> status 'error'
 *  - error preserves partial in streaming
 *  - stop() commits partial, returns to idle
 *  - retry() re-runs last request
 *  - empty/whitespace send is ignored
 *  - send ignored while busy
 */
import { renderHook, act } from '@testing-library/react';
import { Subject } from 'rxjs';
import { useChatStream } from '../llm/useChatStream';
import { DEFAULT_CONFIG } from '../config';

// The hook (rendered without a ConfigProvider) uses DEFAULT_CONFIG; mirror those
// values here so the fake-timer assertions match the real thresholds.
const THINKING_IDLE_MS = DEFAULT_CONFIG.thinkingIdleMs;
const MAX_STREAM_IDLE_MS = DEFAULT_CONFIG.maxStreamIdleMs;
import { __mockStreamChatCompletions } from '@grafana/llm';

jest.mock('@grafana/llm');

describe('useChatStream', () => {
  let subject: Subject<string>;

  beforeEach(() => {
    jest.useFakeTimers();
    subject = new Subject<string>();
    __mockStreamChatCompletions.mockReturnValue(subject.asObservable());
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('starts in idle state with empty messages and no streaming', () => {
    const { result } = renderHook(() => useChatStream());
    expect(result.current.status).toBe('idle');
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.streaming).toBe('');
    expect(result.current.error).toBeUndefined();
  });

  it('ignores empty and whitespace-only send()', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send(''));
    expect(result.current.messages).toHaveLength(0);

    act(() => result.current.send('   '));
    expect(result.current.messages).toHaveLength(0);

    act(() => result.current.send('\t\n'));
    expect(result.current.messages).toHaveLength(0);

    expect(__mockStreamChatCompletions).not.toHaveBeenCalled();
  });

  it('send() appends user turn, starts stream, sets status to thinking initially', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('Hello'));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(result.current.status).toBe('thinking');
    expect(__mockStreamChatCompletions).toHaveBeenCalledTimes(1);
  });

  it('each emission updates streaming text and sets status to streaming', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('Hi'));
    act(() => subject.next('chunk1'));

    expect(result.current.streaming).toBe('chunk1');
    expect(result.current.status).toBe('streaming');

    act(() => subject.next('chunk1 chunk2'));
    expect(result.current.streaming).toBe('chunk1 chunk2');
  });

  it('on complete, commits assistant turn and returns to idle', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('Hi'));
    act(() => subject.next('answer'));
    act(() => subject.complete());

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toEqual({ role: 'assistant', content: 'answer' });
    expect(result.current.streaming).toBe('');
    expect(result.current.status).toBe('idle');
  });

  it('multi-turn resends full history (user + assistant turns)', () => {
    const { result } = renderHook(() => useChatStream());

    // Turn 1
    act(() => result.current.send('Q1'));
    act(() => subject.next('A1'));
    act(() => subject.complete());

    // Turn 2 — new subject
    subject = new Subject<string>();
    __mockStreamChatCompletions.mockReturnValue(subject.asObservable());

    act(() => result.current.send('Q2'));

    // The second call: user Q1 + assistant A1 + user Q2. No system message
    // (the squad has its own; ours would trip the security guardrail). The last
    // user turn is prefixed with the plugin source tag for auditability.
    const lastCall = __mockStreamChatCompletions.mock.calls[1][0];
    const messages = lastCall.messages;
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'user', content: 'Q1' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'A1' });
    expect(messages[2]).toEqual({
      role: 'user',
      content: '[source:grafana-plugin/aigent-squad-chat] Q2',
    });
  });

  it('sets status to thinking after THINKING_IDLE_MS of no content', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('Hi'));
    act(() => subject.next('tok'));

    expect(result.current.status).toBe('streaming');

    // Wait THINKING_IDLE_MS without new content
    act(() => {
      jest.advanceTimersByTime(THINKING_IDLE_MS);
    });

    expect(result.current.status).toBe('thinking');
  });

  it('hard timeout (MAX_STREAM_IDLE_MS) triggers error with partial preserved', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('Hi'));
    act(() => subject.next('partial'));

    // Advance to hard timeout
    act(() => {
      jest.advanceTimersByTime(MAX_STREAM_IDLE_MS);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('idle timeout');
    // Partial is preserved in streaming for display
    expect(result.current.streaming).toBe('partial');
  });

  it('stream error sets error status and preserves partial in streaming', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('Hi'));
    act(() => subject.next('partial'));
    act(() => subject.error(new Error('Network failure')));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Network failure');
    // Partial stays visible
    expect(result.current.streaming).toBe('partial');
  });

  it('stop() commits partial as assistant turn and returns to idle', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('Hi'));
    act(() => subject.next('partial response'));
    act(() => result.current.stop());

    expect(result.current.status).toBe('idle');
    expect(result.current.streaming).toBe('');
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toEqual({ role: 'assistant', content: 'partial response' });
  });

  it('stop() with no partial does not add empty assistant turn', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('Hi'));
    // No content emitted yet
    act(() => result.current.stop());

    expect(result.current.messages).toHaveLength(1); // only the user turn
  });

  it('retry() re-runs the last request with existing history', () => {
    const { result } = renderHook(() => useChatStream());

    // First send + error
    act(() => result.current.send('Hi'));
    act(() => subject.error(new Error('fail')));

    expect(result.current.status).toBe('error');
    expect(__mockStreamChatCompletions).toHaveBeenCalledTimes(1);

    // Retry
    subject = new Subject<string>();
    __mockStreamChatCompletions.mockReturnValue(subject.asObservable());

    act(() => result.current.retry());

    expect(__mockStreamChatCompletions).toHaveBeenCalledTimes(2);
    // The retry should use the same history (user turn still present, source-tagged).
    const lastCall = __mockStreamChatCompletions.mock.calls[1][0];
    expect(lastCall.messages[0]).toEqual({
      role: 'user',
      content: '[source:grafana-plugin/aigent-squad-chat] Hi',
    });
  });

  it('send() is ignored while busy (streaming)', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('First'));
    expect(result.current.status).toBe('thinking');

    act(() => result.current.send('Second'));
    // Only 1 user message, second ignored
    expect(result.current.messages).toHaveLength(1);
    expect(__mockStreamChatCompletions).toHaveBeenCalledTimes(1);
  });

  it('send() is ignored while busy (streaming status)', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('First'));
    act(() => subject.next('tok'));
    expect(result.current.status).toBe('streaming');

    act(() => result.current.send('Second'));
    expect(result.current.messages).toHaveLength(1);
  });

  it('retry() does nothing when idle with no history', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.retry());
    expect(__mockStreamChatCompletions).not.toHaveBeenCalled();
  });

  it('content chunk resets the hard timeout timer', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('Hi'));

    // Advance close to hard timeout
    act(() => jest.advanceTimersByTime(MAX_STREAM_IDLE_MS - 1000));

    // Emit content — resets the timer
    act(() => subject.next('tok'));

    // Advance another period less than MAX_STREAM_IDLE_MS
    act(() => jest.advanceTimersByTime(MAX_STREAM_IDLE_MS - 1000));

    // Should still be streaming, not errored
    expect(result.current.status).not.toBe('error');
  });

  it('complete with empty content does not add assistant turn', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('Hi'));
    act(() => subject.complete());

    expect(result.current.messages).toHaveLength(1); // only user
    expect(result.current.status).toBe('idle');
  });

  it('trims user input before appending', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('  hello  '));
    expect(result.current.messages[0].content).toBe('hello');
  });

  it('second emission resets the thinking idle timer (armIdle branch)', () => {
    const { result } = renderHook(() => useChatStream());

    act(() => result.current.send('Hi'));
    act(() => subject.next('a'));

    // Advance almost to thinking threshold
    act(() => jest.advanceTimersByTime(THINKING_IDLE_MS - 100));
    expect(result.current.status).toBe('streaming');

    // Second chunk resets the idle timer
    act(() => subject.next('ab'));

    // Advance full THINKING_IDLE_MS from the second emission
    act(() => jest.advanceTimersByTime(THINKING_IDLE_MS - 100));
    // Should still be streaming (timer was reset)
    expect(result.current.status).toBe('streaming');

    // Now let it expire
    act(() => jest.advanceTimersByTime(200));
    expect(result.current.status).toBe('thinking');
  });
});
