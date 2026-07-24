/**
 * Tests for MessageBubble — tested against contract:
 *  - Renders markdown via renderMarkdown from @grafana/data (sanitized path)
 *  - User and assistant bubbles are distinguished
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../components/MessageBubble';
import { renderMarkdown } from '@grafana/data';
import { testIds } from '../components/testIds';

jest.mock('@grafana/data');
jest.mock('@grafana/ui');
jest.mock('@emotion/css');

describe('MessageBubble', () => {
  beforeEach(() => {
    (renderMarkdown as jest.Mock).mockClear();
  });

  it('calls renderMarkdown with the content for assistant messages', () => {
    (renderMarkdown as jest.Mock).mockReturnValue('<p><strong>bold</strong></p>');

    render(<MessageBubble role="assistant" content="**bold**" />);

    expect(renderMarkdown).toHaveBeenCalledWith('**bold**');
    // The sanitized HTML is injected
    expect(screen.getByTestId(testIds.chat.message).innerHTML).toContain('<strong>bold</strong>');
  });

  it('calls renderMarkdown for user messages too (same path)', () => {
    (renderMarkdown as jest.Mock).mockReturnValue('<p>hello</p>');

    render(<MessageBubble role="user" content="hello" />);

    expect(renderMarkdown).toHaveBeenCalledWith('hello');
  });

  it('renders the output from renderMarkdown via dangerouslySetInnerHTML', () => {
    (renderMarkdown as jest.Mock).mockReturnValue('<em>safe</em>');

    const { container } = render(<MessageBubble role="assistant" content="*safe*" />);

    const html = container.querySelector('[data-testid="' + testIds.chat.message + '"]')!.innerHTML;
    expect(html).toContain('<em>safe</em>');
  });

  it('renders with the chat.message testId', () => {
    (renderMarkdown as jest.Mock).mockReturnValue('<p>x</p>');

    render(<MessageBubble role="user" content="x" />);

    expect(screen.getByTestId(testIds.chat.message)).toBeInTheDocument();
  });

  describe('reasoning panel', () => {
    it('splits a <think> block: renders the trace panel and only the answer as markdown', () => {
      (renderMarkdown as jest.Mock).mockImplementation((s: string) => `<p>${s}</p>`);

      render(
        <MessageBubble
          role="assistant"
          content={
            '<think>\n🧭 Routed to observability (confidence 95%)\n' +
            "🔧 query(query='x')\n📦 ok\n</think>\nThe answer."
          }
        />
      );

      // Only the answer (not the raw trace) goes through markdown.
      expect(renderMarkdown).toHaveBeenCalledWith('The answer.');
      expect(renderMarkdown).not.toHaveBeenCalledWith(expect.stringContaining('<think>'));

      // The collapsible reasoning panel is present with a summary + tool entry.
      const panel = screen.getByTestId(testIds.chat.reasoning);
      expect(panel).toBeInTheDocument();
      expect(panel.textContent).toContain('observability (95%)');
      expect(panel.textContent).toContain('query');
    });

    it('renders no reasoning panel when there is no <think> block', () => {
      (renderMarkdown as jest.Mock).mockReturnValue('<p>plain</p>');

      render(<MessageBubble role="assistant" content="plain answer" />);

      expect(screen.queryByTestId(testIds.chat.reasoning)).not.toBeInTheDocument();
    });

    it('never parses reasoning for user messages', () => {
      (renderMarkdown as jest.Mock).mockReturnValue('<p>x</p>');

      render(<MessageBubble role="user" content="<think>secret</think>hi" />);

      // User content is rendered verbatim (no split), no reasoning panel.
      expect(screen.queryByTestId(testIds.chat.reasoning)).not.toBeInTheDocument();
      expect(renderMarkdown).toHaveBeenCalledWith('<think>secret</think>hi');
    });

    it('preserves unrecognized reasoning lines as notes in the panel', () => {
      (renderMarkdown as jest.Mock).mockReturnValue('<p>a</p>');

      render(
        <MessageBubble
          role="assistant"
          content={'<think>\n💭 thinking out loud\n</think>\nanswer'}
        />
      );

      expect(screen.getByTestId(testIds.chat.reasoning).textContent).toContain(
        '💭 thinking out loud'
      );
    });
  });
});
