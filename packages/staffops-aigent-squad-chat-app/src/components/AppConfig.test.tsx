/**
 * Tests for AppConfig — tested against the contract:
 *  - renders current jsonData values into the form
 *  - saving posts the edited jsonData to the plugin-settings API
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppConfig } from './AppConfig';
import { testIds } from './testIds';

const post = jest.fn().mockResolvedValue({});
jest.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
}));
jest.mock('@grafana/ui');
jest.mock('@grafana/data');
jest.mock('@emotion/css');

// jsdom doesn't implement reload; stub it so savePluginSettings doesn't throw.
Object.defineProperty(window, 'location', {
  value: { reload: jest.fn() },
  writable: true,
});

const meta: any = {
  id: 'staffops-aigent-squad-chat-app',
  jsonData: { model: 'large', sourceTag: '[x]', reasoningDefaultOpen: true },
};

describe('AppConfig', () => {
  beforeEach(() => post.mockClear());

  it('renders current jsonData values (resolved over defaults)', () => {
    render(<AppConfig plugin={{ meta }} query={{}} path="" />);
    expect((screen.getByTestId(testIds.config.model) as HTMLInputElement).value).toBe('large');
    expect((screen.getByTestId(testIds.config.sourceTag) as HTMLInputElement).value).toBe('[x]');
  });

  it('saves edited settings via the plugin-settings API', async () => {
    render(<AppConfig plugin={{ meta }} query={{}} path="" />);

    fireEvent.change(screen.getByTestId(testIds.config.model), {
      target: { value: 'base' },
    });
    fireEvent.click(screen.getByTestId(testIds.config.save));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/api/plugins/staffops-aigent-squad-chat-app/settings');
    expect(body.enabled).toBe(true);
    expect(body.jsonData.model).toBe('base');
    expect(body.jsonData.sourceTag).toBe('[x]');
    expect(body.jsonData.reasoningDefaultOpen).toBe(true);
  });

  it('edits numeric and boolean fields and persists them', async () => {
    render(<AppConfig plugin={{ meta }} query={{}} path="" />);

    fireEvent.change(screen.getByTestId(testIds.config.thinkingIdle), {
      target: { value: '5000' },
    });
    fireEvent.change(screen.getByTestId(testIds.config.maxIdle), {
      target: { value: '90000' },
    });
    fireEvent.click(screen.getByTestId(testIds.config.reasoningOpen)); // toggles true → false

    fireEvent.click(screen.getByTestId(testIds.config.save));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const body = post.mock.calls[0][1];
    expect(body.jsonData.thinkingIdleMs).toBe(5000);
    expect(body.jsonData.maxStreamIdleMs).toBe(90000);
    expect(body.jsonData.reasoningDefaultOpen).toBe(false);
  });
});
