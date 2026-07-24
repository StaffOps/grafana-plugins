import React from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Alert, Button, useStyles2 } from '@grafana/ui';
import { useChatStream } from '../llm/useChatStream';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { testIds } from './testIds';

export function Conversation() {
  const styles = useStyles2(getStyles);
  const { messages, streaming, status, error, send, stop, retry } = useChatStream();
  const isBusy = status === 'streaming' || status === 'thinking';

  return (
    <div className={styles.container} data-testid={testIds.chat.container}>
      <MessageList messages={messages} streaming={streaming} thinking={status === 'thinking'} />

      {status === 'error' && (
        <Alert title="Streaming error" severity="error" data-testid={testIds.chat.error}>
          <div className={styles.errorBody}>{error}</div>
          <Button variant="secondary" size="sm" onClick={retry} data-testid={testIds.chat.retry}>
            Retry
          </Button>
        </Alert>
      )}

      <ChatInput busy={isBusy} onSend={send} onStop={stop} />
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css({
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    gap: theme.spacing(1),
  }),
  errorBody: css({
    marginBottom: theme.spacing(1),
  }),
});
