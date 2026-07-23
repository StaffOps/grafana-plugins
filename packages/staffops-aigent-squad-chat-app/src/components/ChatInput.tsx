import React, { useState } from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Button, TextArea, useStyles2 } from '@grafana/ui';
import { testIds } from './testIds';

interface Props {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function ChatInput({ busy, onSend, onStop }: Props) {
  const styles = useStyles2(getStyles);
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || busy) {
      return;
    }
    onSend(trimmed);
    setValue('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={styles.row}>
      <TextArea
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask AIgent Squad about your system…"
        rows={2}
        data-testid={testIds.chat.input}
      />
      {busy ? (
        <Button variant="destructive" onClick={onStop} data-testid={testIds.chat.stop}>
          Stop
        </Button>
      ) : (
        <Button onClick={submit} disabled={value.trim().length === 0} data-testid={testIds.chat.send}>
          Send
        </Button>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  row: css({
    display: 'flex',
    alignItems: 'flex-end',
    gap: theme.spacing(1),
    padding: theme.spacing(1),
    borderTop: `1px solid ${theme.colors.border.weak}`,
  }),
});
