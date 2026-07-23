import { useCallback, useEffect, useRef, useState } from 'react';
import { llm } from '@grafana/llm';
import type { Subscription } from 'rxjs';
import type { ChatMessage, StreamStatus } from './types';
import { useAppConfig } from '../components/ConfigContext';

export interface UseChatStream {
  /** Finalized turns (user + assistant), oldest first. */
  messages: ChatMessage[];
  /** In-progress assistant text for the current stream (empty when not streaming). */
  streaming: string;
  status: StreamStatus;
  error?: string;
  /** Send a user message and start streaming the assistant reply. */
  send: (text: string) => void;
  /** Cancel the active stream, keeping any partial reply as a finalized turn. */
  stop: () => void;
  /** Re-run the last request (e.g. after an error), reusing the current history. */
  retry: () => void;
}

export function useChatStream(): UseChatStream {
  const config = useAppConfig();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [error, setError] = useState<string | undefined>(undefined);

  const sub = useRef<Subscription | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hardTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const acc = useRef('');
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const clearTimers = useCallback(() => {
    if (idleTimer.current !== undefined) {
      clearTimeout(idleTimer.current);
      idleTimer.current = undefined;
    }
    if (hardTimer.current !== undefined) {
      clearTimeout(hardTimer.current);
      hardTimer.current = undefined;
    }
  }, []);

  // Error/timeout: keep the partial reply visible in `streaming` and let the user retry.
  const finishWithError = useCallback(
    (message: string) => {
      clearTimers();
      sub.current = null;
      setError(message);
      setStatus('error');
    },
    [clearTimers]
  );

  const runStream = useCallback(
    (history: ChatMessage[]) => {
      sub.current?.unsubscribe();
      clearTimers();
      acc.current = '';
      setStreaming('');
      setError(undefined);
      setStatus('thinking');

      const armHard = () => {
        hardTimer.current = setTimeout(
          () => finishWithError('AIgent Squad stopped responding (idle timeout).'),
          config.maxStreamIdleMs
        );
      };
      const armIdle = () => {
        if (idleTimer.current !== undefined) {
          clearTimeout(idleTimer.current);
        }
        idleTimer.current = setTimeout(() => setStatus('thinking'), config.thinkingIdleMs);
      };
      armHard();

      const tag = config.sourceTag ? `${config.sourceTag} ` : '';
      const chat: llm.Message[] = [
        ...history.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: `${tag}${history[history.length - 1].content}` },
      ];

      sub.current = llm
        .streamChatCompletions({ model: config.model, messages: chat })
        .pipe(llm.accumulateContent())
        .subscribe({
          next: (content: string) => {
            acc.current = content;
            setStreaming(content);
            setStatus('streaming');
            clearTimers();
            armHard();
            armIdle();
          },
          error: (err: Error) => finishWithError(err?.message ?? 'Streaming failed.'),
          complete: () => {
            clearTimers();
            sub.current = null;
            const finalText = acc.current;
            if (finalText.length > 0) {
              setMessages((prev) => [...prev, { role: 'assistant', content: finalText }]);
            }
            setStreaming('');
            acc.current = '';
            setStatus('idle');
          },
        });
    },
    [clearTimers, finishWithError, config]
  );

  const isBusy = status === 'streaming' || status === 'thinking';

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusy) {
        return;
      }
      const next = [...messagesRef.current, { role: 'user' as const, content: trimmed }];
      messagesRef.current = next;
      setMessages(next);
      runStream(next);
    },
    [isBusy, runStream]
  );

  const stop = useCallback(() => {
    sub.current?.unsubscribe();
    sub.current = null;
    clearTimers();
    const partial = acc.current;
    if (partial.length > 0) {
      setMessages((prev) => [...prev, { role: 'assistant', content: partial }]);
    }
    setStreaming('');
    acc.current = '';
    setStatus('idle');
  }, [clearTimers]);

  const retry = useCallback(() => {
    if (isBusy || messagesRef.current.length === 0) {
      return;
    }
    setStreaming('');
    runStream(messagesRef.current);
  }, [isBusy, runStream]);

  useEffect(() => {
    return () => {
      sub.current?.unsubscribe();
      if (idleTimer.current !== undefined) {
        clearTimeout(idleTimer.current);
      }
      if (hardTimer.current !== undefined) {
        clearTimeout(hardTimer.current);
      }
    };
  }, []);

  return { messages, streaming, status, error, send, stop, retry };
}
