import React, { useEffect, useRef } from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Spinner, useStyles2 } from '@grafana/ui';
import type { ChatMessage } from '../llm/types';
import { MessageBubble } from './MessageBubble';
import { testIds } from './testIds';

interface Props {
  messages: ChatMessage[];
  /** In-progress assistant text (rendered as a live bubble). */
  streaming: string;
  /** True while the stream is open but producing no content (tool execution). */
  thinking: boolean;
}

export function MessageList({ messages, streaming, thinking }: Props) {
  const styles = useStyles2(getStyles);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, thinking]);

  return (
    <div className={styles.list}>
      {messages.map((m, i) => (
        <MessageBubble key={i} role={m.role} content={m.content} />
      ))}

      {streaming.length > 0 && (
        <div data-testid={testIds.chat.streaming}>
          <MessageBubble role="assistant" content={streaming} />
        </div>
      )}

      {thinking && (
        <div className={styles.thinking} data-testid={testIds.chat.thinking}>
          <Spinner inline />
          <span>AIgent Squad is working…</span>
        </div>
      )}

      <div ref={bottom} />
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  list: css({
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    padding: theme.spacing(1),
  }),
  thinking: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    color: theme.colors.text.secondary,
    fontStyle: 'italic',
    padding: theme.spacing(0.5, 1),
  }),
});
