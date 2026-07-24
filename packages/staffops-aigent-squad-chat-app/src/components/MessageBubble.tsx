import React, { useMemo } from 'react';
import { css, cx } from '@emotion/css';
import { renderMarkdown, type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { ChatRole } from '../llm/types';
import { splitReasoning, parseTrace } from '../llm/reasoning';
import { useAppConfig } from './ConfigContext';
import { testIds } from './testIds';

interface Props {
  role: ChatRole;
  content: string;
}

export function MessageBubble({ role, content }: Props) {
  const styles = useStyles2(getStyles);
  const config = useAppConfig();
  const isUser = role === 'user';

  // Assistant replies may wrap a tool-trace / reasoning block in <think>…</think>.
  // Split it out, then parse the trace into a compact summary + clean call list so
  // the raw wall of queries never lands in the answer body.
  const { reasoning, answer } = useMemo(
    () => (isUser ? { reasoning: '', answer: content } : splitReasoning(content)),
    [isUser, content]
  );
  const trace = useMemo(() => (reasoning ? parseTrace(reasoning) : null), [reasoning]);

  // renderMarkdown sanitizes output by default (marked + XSS sanitizer) — the
  // sanctioned safe path satisfying the "assistant markdown is sanitized" invariant.
  const answerHtml = useMemo(() => renderMarkdown(answer), [answer]);

  const hasTrace = trace !== null && (trace.calls.length > 0 || Boolean(trace.routedTo));

  return (
    <div
      className={cx(styles.row, isUser ? styles.rowUser : styles.rowAssistant)}
      data-testid={testIds.chat.message}
    >
      <div className={cx(styles.bubble, isUser ? styles.user : styles.assistant)}>
        {hasTrace && (
          // Always collapsed by default — the spinner communicates progress; the
          // trace is on-demand detail, not the main content.
          <details
            className={styles.reasoning}
            open={config.reasoningDefaultOpen}
            data-testid={testIds.chat.reasoning}
          >
            <summary className={styles.reasoningSummary}>
              🧠 {trace!.summary || 'tool trace'}
            </summary>
            <ul className={styles.traceList}>
              {trace!.calls.map((c, i) => (
                <li key={i}>
                  {c.kind === 'tool' ? (
                    <>
                      <span className={styles.tool}>{c.tool}</span>
                      <span className={styles.arrow}>→</span>
                      <span className={styles.result}>{c.result}</span>
                    </>
                  ) : (
                    <span className={styles.note}>{c.result}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        {answer && (
          <div className={styles.markdown} dangerouslySetInnerHTML={{ __html: answerHtml }} />
        )}
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  row: css({
    display: 'flex',
    width: '100%',
    // Allow the flex child (bubble) to shrink below its intrinsic content width,
    // otherwise a wide <pre> code block forces it past maxWidth and overflows.
    minWidth: 0,
  }),
  rowUser: css({
    justifyContent: 'flex-end',
  }),
  rowAssistant: css({
    justifyContent: 'flex-start',
  }),
  bubble: css({
    maxWidth: '85%',
    minWidth: 0,
    // Contain everything inside the rounded bubble — nothing bleeds past the border.
    overflow: 'hidden',
    padding: theme.spacing(1, 1.5),
    borderRadius: theme.shape.radius.default,
    wordBreak: 'break-word',
  }),
  user: css({
    background: theme.colors.primary.main,
    color: theme.colors.primary.contrastText,
  }),
  assistant: css({
    background: theme.colors.background.secondary,
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border.weak}`,
  }),
  markdown: css({
    minWidth: 0,
    overflowWrap: 'break-word',
    '& > *:first-child': { marginTop: 0 },
    '& p:last-child': { marginBottom: 0 },
    // Lists: Grafana's reset zeroes list padding, so markers (rendered outside the
    // content box) fall into the clipped area and get cut off by overflow:hidden.
    // Restore left padding so bullets/numbers sit inside the bubble.
    '& ul, & ol': {
      paddingLeft: theme.spacing(3),
      margin: theme.spacing(0.5, 0),
    },
    '& li': { marginBottom: theme.spacing(0.25) },
    // Long code blocks scroll horizontally INSIDE the bubble instead of widening it.
    '& pre': {
      maxWidth: '100%',
      background: theme.colors.background.canvas,
      padding: theme.spacing(1),
      borderRadius: theme.shape.radius.default,
      overflowX: 'auto',
    },
    '& code': {
      fontFamily: theme.typography.fontFamilyMonospace,
    },
    // Tables / images can also be wider than the bubble — keep them contained.
    '& table': { display: 'block', maxWidth: '100%', overflowX: 'auto' },
    '& img': { maxWidth: '100%' },
  }),
  reasoning: css({
    marginBottom: theme.spacing(1),
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
    background: theme.colors.background.canvas,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(0.5, 1),
  }),
  reasoningSummary: css({
    cursor: 'pointer',
    userSelect: 'none',
    fontStyle: 'italic',
    color: theme.colors.text.secondary,
  }),
  traceList: css({
    listStyle: 'none',
    margin: theme.spacing(1, 0, 0, 0),
    padding: 0,
    maxHeight: '200px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.25),
    '& li': {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(0.75),
      fontFamily: theme.typography.fontFamilyMonospace,
      fontSize: theme.typography.bodySmall.fontSize,
    },
  }),
  tool: css({
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeightMedium,
  }),
  arrow: css({
    color: theme.colors.text.disabled,
  }),
  result: css({
    color: theme.colors.text.secondary,
  }),
  note: css({
    color: theme.colors.text.secondary,
    fontStyle: 'italic',
  }),
});
