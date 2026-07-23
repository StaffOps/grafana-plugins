/**
 * Tests for ChatInput — tested against contract:
 *  - Enter sends & clears the input
 *  - Shift+Enter does NOT send
 *  - Send button disabled when input is empty
 *  - Shows Stop button when busy, calls onStop on click
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from '../components/ChatInput';
import { testIds } from '../components/testIds';

jest.mock('@grafana/ui');
jest.mock('@emotion/css');

describe('ChatInput', () => {
  const onSend = jest.fn();
  const onStop = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders input and Send button when not busy', () => {
    render(<ChatInput busy={false} onSend={onSend} onStop={onStop} />);

    expect(screen.getByTestId(testIds.chat.input)).toBeInTheDocument();
    expect(screen.getByTestId(testIds.chat.send)).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.chat.stop)).not.toBeInTheDocument();
  });

  it('Send button is disabled when input is empty', () => {
    render(<ChatInput busy={false} onSend={onSend} onStop={onStop} />);

    const send = screen.getByTestId(testIds.chat.send);
    expect(send).toBeDisabled();
  });

  it('Send button enabled when input has content', () => {
    render(<ChatInput busy={false} onSend={onSend} onStop={onStop} />);

    const input = screen.getByTestId(testIds.chat.input);
    fireEvent.change(input, { target: { value: 'hello' } });

    const send = screen.getByTestId(testIds.chat.send);
    expect(send).not.toBeDisabled();
  });

  it('Enter key sends the message and clears input', () => {
    render(<ChatInput busy={false} onSend={onSend} onStop={onStop} />);

    const input = screen.getByTestId(testIds.chat.input);
    fireEvent.change(input, { target: { value: 'message' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('message');
    expect((input as HTMLTextAreaElement).value).toBe('');
  });

  it('Shift+Enter does NOT send', () => {
    render(<ChatInput busy={false} onSend={onSend} onStop={onStop} />);

    const input = screen.getByTestId(testIds.chat.input);
    fireEvent.change(input, { target: { value: 'message' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('clicking Send button sends and clears', () => {
    render(<ChatInput busy={false} onSend={onSend} onStop={onStop} />);

    const input = screen.getByTestId(testIds.chat.input);
    fireEvent.change(input, { target: { value: 'hi' } });

    const send = screen.getByTestId(testIds.chat.send);
    fireEvent.click(send);

    expect(onSend).toHaveBeenCalledWith('hi');
    expect((input as HTMLTextAreaElement).value).toBe('');
  });

  it('does not send empty input on Enter', () => {
    render(<ChatInput busy={false} onSend={onSend} onStop={onStop} />);

    const input = screen.getByTestId(testIds.chat.input);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows Stop button when busy', () => {
    render(<ChatInput busy={true} onSend={onSend} onStop={onStop} />);

    expect(screen.getByTestId(testIds.chat.stop)).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.chat.send)).not.toBeInTheDocument();
  });

  it('clicking Stop calls onStop', () => {
    render(<ChatInput busy={true} onSend={onSend} onStop={onStop} />);

    fireEvent.click(screen.getByTestId(testIds.chat.stop));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('does not send when busy even with content', () => {
    render(<ChatInput busy={true} onSend={onSend} onStop={onStop} />);

    const input = screen.getByTestId(testIds.chat.input);
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });
});
