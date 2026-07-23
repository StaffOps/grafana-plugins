/**
 * Mock for @grafana/llm — allows tests to control the streaming Observable,
 * the enabled() promise, and accumulateContent() passthrough.
 */
import { Observable, type OperatorFunction } from 'rxjs';

export const __mockEnabled = jest.fn<Promise<boolean>, []>();
export const __mockStreamChatCompletions = jest.fn<Observable<string>, [any]>();

export const llm = {
  enabled: __mockEnabled,
  streamChatCompletions: __mockStreamChatCompletions,
  accumulateContent: (): OperatorFunction<string, string> => (source) => source,
  Model: {
    BASE: 'base' as const,
    LARGE: 'large' as const,
  },
  Message: {} as any,
};
