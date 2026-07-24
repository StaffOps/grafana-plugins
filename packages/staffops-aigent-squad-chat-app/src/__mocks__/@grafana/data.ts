/**
 * Mock for @grafana/data — exposes renderMarkdown as a jest.fn so tests can assert
 * that the sanitized markdown path is used.
 */
export const renderMarkdown = jest.fn((content: string) => `<p>${content}</p>`);

// Re-export anything else components need — GrafanaTheme2 is type-only so it doesn't need a value mock.
export type GrafanaTheme2 = any;
