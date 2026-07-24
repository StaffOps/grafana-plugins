/**
 * Tests for MessageList — tested against contract:
 *  - Renders finalized messages
 *  - Renders streaming bubble when streaming is non-empty
 *  - Renders thinking indicator when thinking=true
 *  - Does NOT render streaming/thinking when they're off
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MessageList } from '../components/MessageList';
import { testIds } from '../components/testIds';
import type { ChatMessage } from '../llm/types';

jest.mock('@grafana/data');
jest.mock('@grafana/ui');
jest.mock('@emotion/css');

describe('MessageList', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there' },
  ];

  it('renders all finalized messages as MessageBubbles', () => {
    render(<MessageList messages={messages} streaming="" thinking={false} />);

    const bubbles = screen.getAllByTestId(testIds.chat.message);
    expect(bubbles).toHaveLength(2);
  });

  it('renders streaming bubble when streaming text is present', () => {
    render(<MessageList messages={messages} streaming="in progress" thinking={false} />);

    expect(screen.getByTestId(testIds.chat.streaming)).toBeInTheDocument();
    // Streaming bubble adds an extra message bubble
    const bubbles = screen.getAllByTestId(testIds.chat.message);
    expect(bubbles).toHaveLength(3); // 2 finalized + 1 streaming
  });

  it('does NOT render streaming bubble when streaming is empty', () => {
    render(<MessageList messages={messages} streaming="" thinking={false} />);

    expect(screen.queryByTestId(testIds.chat.streaming)).not.toBeInTheDocument();
  });

  it('renders thinking indicator when thinking=true', () => {
    render(<MessageList messages={[]} streaming="" thinking={true} />);

    expect(screen.getByTestId(testIds.chat.thinking)).toBeInTheDocument();
    expect(screen.getByText(/AIgent Squad is working/)).toBeInTheDocument();
  });

  it('does NOT render thinking indicator when thinking=false', () => {
    render(<MessageList messages={[]} streaming="" thinking={false} />);

    expect(screen.queryByTestId(testIds.chat.thinking)).not.toBeInTheDocument();
  });

  it('renders both streaming and thinking can coexist', () => {
    render(<MessageList messages={[]} streaming="partial" thinking={true} />);

    expect(screen.getByTestId(testIds.chat.streaming)).toBeInTheDocument();
    expect(screen.getByTestId(testIds.chat.thinking)).toBeInTheDocument();
  });

  it('renders empty state (no messages, no streaming, no thinking)', () => {
    render(<MessageList messages={[]} streaming="" thinking={false} />);

    expect(screen.queryByTestId(testIds.chat.message)).not.toBeInTheDocument();
    expect(screen.queryByTestId(testIds.chat.streaming)).not.toBeInTheDocument();
    expect(screen.queryByTestId(testIds.chat.thinking)).not.toBeInTheDocument();
  });
});
