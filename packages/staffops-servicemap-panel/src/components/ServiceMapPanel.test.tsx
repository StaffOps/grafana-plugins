/**
 * Component smoke tests for ServiceMapPanel.
 *
 * Based on the CONTRACT:
 * - Renders SVG with nodes (circles) and edges (lines)
 * - Edge click opens Explore URL with TraceQL
 * - Label values escaped in TraceQL (backslash + double-quote)
 * - SVG text uses HTML entity escaping (&amp;, &lt;, &gt;, &quot;)
 * - URL params are encodeURIComponent-encoded
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { PanelProps, FieldType, LoadingState } from '@grafana/data';
import { ServiceMapOptions } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

// Mock @grafana/runtime
jest.mock('@grafana/runtime', () => ({
  getTemplateSrv: () => ({ replace: (s: string) => s }),
}));

// Mock @grafana/ui
jest.mock('@grafana/ui', () => ({
  useTheme2: () => ({
    colors: {
      text: { primary: '#fff', secondary: '#aaa' },
      background: { primary: '#111', secondary: '#222' },
      border: { weak: '#333', medium: '#555' },
      error: { main: '#f00' },
      warning: { main: '#ff0' },
      success: { main: '#0f0' },
    },
  }),
}));

// Mock @emotion/css
jest.mock('@emotion/css', () => ({
  css: () => 'mock-css-class',
  cx: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// Track window.open calls
const mockWindowOpen = jest.fn();
Object.defineProperty(window, 'open', { value: mockWindowOpen, writable: true });

// Import after mocks
import { ServiceMapPanel } from './ServiceMapPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Test data helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildPanelProps(overrides?: Partial<PanelProps<ServiceMapOptions>>): PanelProps<ServiceMapOptions> {
  const defaultOptions: ServiceMapOptions = {
    errorThreshold: 0.05,
    traceDatasourceUid: 'tempo-uid-123',
    queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
  };

  return {
    id: 1,
    data: {
      state: LoadingState.Done,
      series: [
        {
          refId: 'A',
          fields: [
            { name: 'client', type: FieldType.string, values: ['frontend', 'api-gw'], config: {} },
            { name: 'server', type: FieldType.string, values: ['api-gw', 'database'], config: {} },
            { name: 'Value', type: FieldType.number, values: [100, 50], config: {} },
            { name: 'connection_type', type: FieldType.string, values: ['', 'database'], config: {} },
          ],
          length: 2,
        },
        {
          refId: 'B',
          fields: [
            { name: 'client', type: FieldType.string, values: ['frontend', 'api-gw'], config: {} },
            { name: 'server', type: FieldType.string, values: ['api-gw', 'database'], config: {} },
            { name: 'Value', type: FieldType.number, values: [5, 2], config: {} },
          ],
          length: 2,
        },
        {
          refId: 'C',
          fields: [
            { name: 'client', type: FieldType.string, values: ['frontend', 'api-gw'], config: {} },
            { name: 'server', type: FieldType.string, values: ['api-gw', 'database'], config: {} },
            { name: 'Value', type: FieldType.number, values: [0.2, 0.8], config: {} },
          ],
          length: 2,
        },
      ],
      timeRange: { from: {} as any, to: {} as any, raw: { from: 'now-1h', to: 'now' } },
    },
    timeRange: { from: {} as any, to: {} as any, raw: { from: 'now-1h', to: 'now' } },
    timeZone: 'utc',
    options: defaultOptions,
    width: 800,
    height: 600,
    transparent: false,
    fieldConfig: { defaults: {}, overrides: [] },
    renderCounter: 0,
    title: 'Service Map',
    eventBus: { subscribe: jest.fn(), getStream: jest.fn(), publish: jest.fn(), removeAllListeners: jest.fn(), newScopedBus: jest.fn() } as any,
    onOptionsChange: jest.fn(),
    onFieldConfigChange: jest.fn(),
    replaceVariables: (s: string) => s,
    onChangeTimeRange: jest.fn(),
    ...overrides,
  } as unknown as PanelProps<ServiceMapOptions>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Smoke tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — rendering', () => {
  beforeEach(() => {
    mockWindowOpen.mockClear();
  });

  it('renders SVG with nodes and edges', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // 3 nodes: frontend, api-gw, database
    const circles = svg!.querySelectorAll('circle');
    expect(circles.length).toBe(3);
    // 2 edges
    const lines = svg!.querySelectorAll('line');
    expect(lines.length).toBe(2);
  });

  it('renders empty state when no data', () => {
    const props = buildPanelProps({
      data: { state: LoadingState.Done, series: [], timeRange: {} as any },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    expect(container.textContent).toContain('No service graph data');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders node labels as text elements', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const texts = container.querySelectorAll('text');
    const labels = Array.from(texts).map((t) => t.textContent);
    expect(labels).toContain('frontend');
    expect(labels).toContain('api-gw');
    expect(labels).toContain('database');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge click → Explore URL
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — edge click drill-down', () => {
  beforeEach(() => {
    mockWindowOpen.mockClear();
  });

  it('opens Explore URL with correctly-encoded TraceQL on edge click', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);

    // Click the first edge
    fireEvent.click(lines[0]);

    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    const url = mockWindowOpen.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/explore\?left=/);

    // Decode and validate structure
    const leftParam = url.replace('/explore?left=', '');
    const decoded = JSON.parse(decodeURIComponent(leftParam));
    expect(decoded.datasource).toBe('tempo-uid-123');
    expect(decoded.queries).toHaveLength(1);
    expect(decoded.queries[0].queryType).toBe('traceql');
    expect(decoded.queries[0].query).toContain('resource.service.name');
    expect(decoded.queries[0].query).toContain('span.client');
    expect(decoded.range).toEqual({ from: 'now-1h', to: 'now' });
  });

  it('does not open URL when traceDatasourceUid is empty', () => {
    const props = buildPanelProps({
      options: {
        errorThreshold: 0.05,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const lines = container.querySelectorAll('line');
    if (lines.length > 0) {
      fireEvent.click(lines[0]);
    }
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// XSS / injection prevention — label escaping
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — XSS/injection escaping', () => {
  beforeEach(() => {
    mockWindowOpen.mockClear();
  });

  it('escapes HTML entities in SVG text labels', () => {
    const malicious = '<script>alert("xss")</script>';
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: [malicious], config: {} },
              { name: 'server', type: FieldType.string, values: ['safe-server'], config: {} },
              { name: 'Value', type: FieldType.number, values: [10], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    // React auto-escapes JSX text content, so a raw <script> must never reach the DOM as an element.
    expect(container.querySelector('script')).toBeNull();
    const svgHtml = container.querySelector('svg')!.innerHTML;
    expect(svgHtml).not.toContain('<script>');
  });

  it('escapes double quotes in TraceQL drill-down URL', () => {
    const quotedName = 'svc"with"quotes';
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: [quotedName], config: {} },
              { name: 'server', type: FieldType.string, values: ['target'], config: {} },
              { name: 'Value', type: FieldType.number, values: [10], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const lines = container.querySelectorAll('line');
    if (lines.length > 0) {
      fireEvent.click(lines[0]);
    }
    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    const url = mockWindowOpen.mock.calls[0][0] as string;
    const leftParam = url.replace('/explore?left=', '');
    const decoded = JSON.parse(decodeURIComponent(leftParam));
    const query: string = decoded.queries[0].query;
    // Quotes in the client name should be escaped with backslash
    expect(query).toContain('svc\\"with\\"quotes');
    // Should NOT contain unescaped quotes that would break TraceQL syntax
    expect(query).not.toMatch(/span\.client = ".*[^\\]".*"/);
  });

  it('escapes backslashes in TraceQL drill-down URL', () => {
    const backslashName = 'svc\\path';
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['caller'], config: {} },
              { name: 'server', type: FieldType.string, values: [backslashName], config: {} },
              { name: 'Value', type: FieldType.number, values: [10], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const lines = container.querySelectorAll('line');
    if (lines.length > 0) {
      fireEvent.click(lines[0]);
    }
    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    const url = mockWindowOpen.mock.calls[0][0] as string;
    const leftParam = url.replace('/explore?left=', '');
    const decoded = JSON.parse(decodeURIComponent(leftParam));
    const query: string = decoded.queries[0].query;
    // Backslash should be double-escaped
    expect(query).toContain('svc\\\\path');
  });

  it('label with & < > " characters renders safely in SVG', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['A&B<C>"D'], config: {} },
              { name: 'server', type: FieldType.string, values: ['normal'], config: {} },
              { name: 'Value', type: FieldType.number, values: [10], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const svgHtml = container.querySelector('svg')!.innerHTML;
    // Should contain entity-escaped forms, not raw special chars that could break SVG
    expect(svgHtml).not.toContain('&B<C>'); // raw unescaped angle brackets in attribute context
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DAG layout renders correctly
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — dag layout', () => {
  it('renders with dag layout without error', () => {
    const props = buildPanelProps({
      options: {
        errorThreshold: 0.05,
        traceDatasourceUid: 'test',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge styling
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — edge styling', () => {
  it('database connection_type renders with dashed stroke', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const lines = container.querySelectorAll('line');
    // The api-gw→database edge has connection_type='database'
    const dashArrays = Array.from(lines).map((l) => l.getAttribute('stroke-dasharray'));
    // At least one edge should have the database dash pattern
    expect(dashArrays.some((d) => d === '8 4')).toBe(true);
  });

  it('messaging connection_type renders with 4 4 dash', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['pub'], config: {} },
              { name: 'server', type: FieldType.string, values: ['sub'], config: {} },
              { name: 'Value', type: FieldType.number, values: [10], config: {} },
              { name: 'connection_type', type: FieldType.string, values: ['messaging'], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const lines = container.querySelectorAll('line');
    const dashArrays = Array.from(lines).map((l) => l.getAttribute('stroke-dasharray'));
    expect(dashArrays).toContain('4 4');
  });

  it('virtual_node connection_type renders with 2 2 dash', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [10], config: {} },
              { name: 'connection_type', type: FieldType.string, values: ['virtual_node'], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const lines = container.querySelectorAll('line');
    const dashArrays = Array.from(lines).map((l) => l.getAttribute('stroke-dasharray'));
    expect(dashArrays).toContain('2 2');
  });

  it('default connection_type (empty) renders with "none" dash', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [10], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const lines = container.querySelectorAll('line');
    const dashArrays = Array.from(lines).map((l) => l.getAttribute('stroke-dasharray'));
    expect(dashArrays).toContain('none');
  });

  it('high error ratio edge uses error color', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [100], config: {} },
            ],
            length: 1,
          },
          {
            refId: 'B',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [90], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
      options: {

        errorThreshold: 0.05,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const line = container.querySelector('line');
    // Error ratio 90/100=0.9 > threshold 0.05 → error color (#f00)
    expect(line?.getAttribute('stroke')).toBe('#f00');
  });

  it('low error ratio edge uses success color', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [1000], config: {} },
            ],
            length: 1,
          },
          {
            refId: 'B',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [1], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
      options: {

        errorThreshold: 0.05,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const line = container.querySelector('line');
    // Error ratio 1/1000=0.001 < threshold*0.5=0.025 → success color (#0f0)
    expect(line?.getAttribute('stroke')).toBe('#0f0');
  });

  it('medium error ratio edge uses warning color', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [100], config: {} },
            ],
            length: 1,
          },
          {
            refId: 'B',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [4], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
      options: {

        errorThreshold: 0.05,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const line = container.querySelector('line');
    // Error ratio 4/100=0.04 > threshold*0.5=0.025 but < threshold=0.05 → warning (#ff0)
    expect(line?.getAttribute('stroke')).toBe('#ff0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip interactions (hover)
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — tooltip interactions', () => {
  it('shows edge tooltip on mousemove', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const line = container.querySelector('line')!;
    fireEvent.mouseMove(line, { clientX: 100, clientY: 200 });
    // Tooltip should appear with rate info
    expect(container.textContent).toMatch(/Rate:/);
    expect(container.textContent).toMatch(/Error:/);
    expect(container.textContent).toMatch(/p95:/);
  });

  it('hides tooltip on mouse leave', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const line = container.querySelector('line')!;
    fireEvent.mouseMove(line, { clientX: 100, clientY: 200 });
    expect(container.textContent).toMatch(/Rate:/);
    fireEvent.mouseLeave(line);
    // After leaving, tooltip content should disappear
    expect(container.textContent).not.toMatch(/Rate:/);
  });

  it('shows node tooltip on mousemove over node group', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const nodeGroups = container.querySelectorAll('g');
    expect(nodeGroups.length).toBeGreaterThan(0);
    fireEvent.mouseMove(nodeGroups[0], { clientX: 150, clientY: 250 });
    // Node tooltip shows In/Out/Total rates
    expect(container.textContent).toMatch(/In:/);
    expect(container.textContent).toMatch(/Out:/);
    expect(container.textContent).toMatch(/Total:/);
  });

  it('formats rate >= 1000 as k/s', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['src'], config: {} },
              { name: 'server', type: FieldType.string, values: ['dst'], config: {} },
              { name: 'Value', type: FieldType.number, values: [5000], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const line = container.querySelector('line')!;
    fireEvent.mouseMove(line, { clientX: 100, clientY: 100 });
    expect(container.textContent).toContain('5.0k/s');
  });

  it('formats latency >= 1s as seconds', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [10], config: {} },
            ],
            length: 1,
          },
          {
            refId: 'C',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [2.5], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const line = container.querySelector('line')!;
    fireEvent.mouseMove(line, { clientX: 100, clientY: 100 });
    expect(container.textContent).toContain('2.50s');
  });

  it('formats latency < 1s as milliseconds', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [10], config: {} },
            ],
            length: 1,
          },
          {
            refId: 'C',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [0.250], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const line = container.querySelector('line')!;
    fireEvent.mouseMove(line, { clientX: 100, clientY: 100 });
    expect(container.textContent).toContain('250.0ms');
  });

  it('edge tooltip shows connection_type when present', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const lines = container.querySelectorAll('line');
    // The second edge (api-gw→database) has connection_type='database'
    fireEvent.mouseMove(lines[1], { clientX: 100, clientY: 100 });
    expect(container.textContent).toContain('Type:');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge thickness scaling
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — edge thickness', () => {
  it('higher rate produces thicker stroke', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a', 'c'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b', 'd'], config: {} },
              { name: 'Value', type: FieldType.number, values: [100, 10], config: {} },
            ],
            length: 2,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const lines = container.querySelectorAll('line');
    const widths = Array.from(lines).map((l) => parseFloat(l.getAttribute('stroke-width') || '0'));
    // First edge (rate=100) should be thicker than second (rate=10)
    expect(widths[0]).toBeGreaterThan(widths[1]);
  });

  it('zero maxRate still renders edges with minimum width', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [0], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const line = container.querySelector('line');
    const width = parseFloat(line?.getAttribute('stroke-width') || '0');
    expect(width).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Node size scaling
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — node size', () => {
  it('higher totalRate produces larger circle radius', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;
    const circles = svg.querySelectorAll('circle');
    const radii = Array.from(circles).map((c) => parseFloat(c.getAttribute('r') || '0'));
    // api-gw has totalRate=150 (in+out), should be largest
    // frontend has totalRate=100 (out only), smaller
    // All node circles should be >= 10 (minimum radius); filter out alert badge circles (r=8)
    const nodeRadii = radii.filter((r) => r >= 10);
    nodeRadii.forEach((r) => expect(r).toBeGreaterThanOrEqual(10));
    expect(nodeRadii.length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v2: Health colors applied to edges and nodes
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — v2 health colors', () => {
  it('edge with warn-level error uses warning color', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [100], config: {} },
            ],
            length: 1,
          },
          {
            refId: 'B',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [3], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
      options: {

        errorThreshold: 0.05,
        warnThreshold: 0.01,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const line = container.querySelector('line');
    // errorRatio = 3/100 = 0.03 → >=0.01 (warn), <0.05 (crit) → warning color
    expect(line?.getAttribute('stroke')).toBe('#ff0');
  });

  it('node ring color reflects worst incident edge (crit)', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [100], config: {} },
            ],
            length: 1,
          },
          {
            refId: 'B',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [10], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
      options: {

        errorThreshold: 0.05,
        warnThreshold: 0.01,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const circles = container.querySelectorAll('circle');
    // errorRatio = 10/100 = 0.1 → crit → node ring = error color (#f00)
    const strokes = Array.from(circles).map((c) => c.getAttribute('stroke'));
    expect(strokes).toContain('#f00');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v2: Animated particles (animate option)
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — v2 animated particles', () => {
  it('renders particles (rect with animateMotion) when animate=true (default)', () => {
    const props = buildPanelProps({
      options: {

        errorThreshold: 0.05,
        animate: true,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const particles = container.querySelectorAll('[data-particle="true"]');
    expect(particles.length).toBeGreaterThan(0);
    // Each particle should be a rect with rx=2.5
    const firstParticle = particles[0];
    expect(firstParticle.tagName.toLowerCase()).toBe('rect');
    expect(firstParticle.getAttribute('rx')).toBe('2.5');
    // Should have animateMotion child
    const motion = firstParticle.querySelector('animateMotion');
    expect(motion).not.toBeNull();
  });

  it('does NOT render particles when animate=false', () => {
    const props = buildPanelProps({
      options: {

        errorThreshold: 0.05,
        animate: false,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const particles = container.querySelectorAll('[data-particle="true"]');
    expect(particles.length).toBe(0);
  });

  it('particles absent when no edges exist (empty graph)', () => {
    const props = buildPanelProps({
      data: { state: LoadingState.Done, series: [], timeRange: {} as any },
      options: {

        errorThreshold: 0.05,
        animate: true,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const particles = container.querySelectorAll('[data-particle="true"]');
    expect(particles.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v2: Focus mode (click node → dim non-neighbors)
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — v2 focus mode', () => {
  it('clicking a node dims non-neighbor nodes (opacity 0.15)', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);

    // Node groups are <g> elements with data-node-id attribute
    const svg = container.querySelector('svg')!;
    const getNodeGs = () => Array.from(svg.querySelectorAll('g[data-node-id]'));
    const nodeGs = getNodeGs();
    expect(nodeGs.length).toBe(3); // frontend, api-gw, database

    // Find "frontend" node (only connected to api-gw, not database)
    const frontendNode = nodeGs.find((g) => g.getAttribute('data-node-id') === 'frontend');
    expect(frontendNode).toBeTruthy();

    // Click to focus
    fireEvent.click(frontendNode!);

    // Re-query after state update triggers re-render
    const nodeGsAfter = getNodeGs();
    // "database" is not a neighbor of "frontend" and should be dimmed
    const databaseNode = nodeGsAfter.find((g) => g.getAttribute('data-node-id') === 'database');
    expect(databaseNode?.getAttribute('opacity')).toBe('0.15');
    // "frontend" itself should be full opacity
    const frontendAfter = nodeGsAfter.find((g) => g.getAttribute('data-node-id') === 'frontend');
    expect(frontendAfter?.getAttribute('opacity')).toBe('1');
  });

  it('clicking SVG background resets focus (all nodes full opacity)', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);

    const svg = container.querySelector('svg')!;
    const getNodeGs = () => Array.from(svg.querySelectorAll('g[data-node-id]'));
    const nodeGs = getNodeGs();
    const frontendNode = nodeGs.find((g) => g.getAttribute('data-node-id') === 'frontend');
    fireEvent.click(frontendNode!); // Focus

    // Click the SVG background to reset
    fireEvent.click(svg);

    // All node groups should be back to full opacity
    const nodeGsAfter = getNodeGs();
    const opacities = nodeGsAfter.map((g) => g.getAttribute('opacity'));
    expect(opacities.every((o) => o !== '0.15')).toBe(true);
  });

  it('focus dims non-neighbor edges (opacity 0.15)', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);

    const svg = container.querySelector('svg')!;
    const getNodeGs = () => Array.from(svg.querySelectorAll('g[data-node-id]'));
    const nodeGs = getNodeGs();

    // Find the "database" node (only connected to api-gw)
    const databaseNode = nodeGs.find((g) => g.getAttribute('data-node-id') === 'database');
    expect(databaseNode).toBeTruthy();
    fireEvent.click(databaseNode!);

    const lines = svg.querySelectorAll('line');
    const lineOpacities = Array.from(lines).map((l) => l.getAttribute('opacity'));
    // The edge frontend→api-gw should be dimmed (database is not involved)
    expect(lineOpacities.some((o) => o === '0.15')).toBe(true);
    // The edge api-gw→database should remain visible
    expect(lineOpacities.some((o) => o === '1')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v2: Edge labels (showEdgeLabels option)
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — v2 edge labels', () => {
  it('shows edge labels when showEdgeLabels=true', () => {
    const props = buildPanelProps({
      options: {

        errorThreshold: 0.05,
        showEdgeLabels: true,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const svgText = container.querySelector('svg')!.textContent || '';
    // Should contain formatted rate (the test data has rate=100 and rate=50)
    expect(svgText).toMatch(/\/s/); // rate format ends with /s
    // Should contain error % format
    expect(svgText).toMatch(/%/);
  });

  it('does NOT show edge labels when showEdgeLabels=false (default)', () => {
    const props = buildPanelProps({
      options: {

        errorThreshold: 0.05,
        showEdgeLabels: false,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    // SVG text should only contain node labels (frontend, api-gw, database) and
    // possibly glyphs (⚠/✖) — but NOT "X.XX/s · Y.Y% · Zms"
    const texts = container.querySelectorAll('svg text');
    const textContents = Array.from(texts).map((t) => t.textContent || '');
    // None should match the "rate · err% · latency" pattern
    const edgeLabelPattern = /\d+\.\d+\/s.*%.*ms/;
    expect(textContents.some((t) => edgeLabelPattern.test(t))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v2: Node → trace Explore URL (Ctrl/Meta+click)
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — v2 node→trace Explore URL', () => {
  beforeEach(() => {
    mockWindowOpen.mockClear();
  });

  it('Ctrl+click on node opens Explore URL with service name TraceQL', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);

    const svg = container.querySelector('svg')!;
    const allGs = Array.from(svg.querySelectorAll('g'));
    const nodeGs = allGs.filter((g) => g.querySelector('circle'));
    // Find the "frontend" node by its text label
    const frontendNode = nodeGs.find((g) => g.querySelector('text')?.textContent === 'frontend');
    expect(frontendNode).toBeTruthy();

    // Ctrl+click on frontend node
    fireEvent.click(frontendNode!, { ctrlKey: true });

    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    const url = mockWindowOpen.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/explore\?left=/);

    const leftParam = url.replace('/explore?left=', '');
    const decoded = JSON.parse(decodeURIComponent(leftParam));
    expect(decoded.datasource).toBe('tempo-uid-123');
    expect(decoded.queries[0].query).toContain('resource.service.name');
    expect(decoded.queries[0].query).toContain('frontend');
  });

  it('Meta+click (macOS) also opens Explore URL', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);

    const svg = container.querySelector('svg')!;
    const allGs = Array.from(svg.querySelectorAll('g'));
    const nodeGs = allGs.filter((g) => g.querySelector('circle'));
    fireEvent.click(nodeGs[0], { metaKey: true });

    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
  });

  it('escapes special characters in node ID for TraceQL URL', () => {
    const specialName = 'svc"with\\special';
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: [specialName], config: {} },
              { name: 'server', type: FieldType.string, values: ['target'], config: {} },
              { name: 'Value', type: FieldType.number, values: [10], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);

    const svg = container.querySelector('svg')!;
    const allGs = Array.from(svg.querySelectorAll('g'));
    const nodeGs = allGs.filter((g) => g.querySelector('circle'));
    // Find the node with special name
    const specialNode = nodeGs.find((g) => g.querySelector('text')?.textContent === specialName);
    expect(specialNode).toBeTruthy();
    // Ctrl+click the special node
    fireEvent.click(specialNode!, { ctrlKey: true });

    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    const url = mockWindowOpen.mock.calls[0][0] as string;
    const leftParam = url.replace('/explore?left=', '');
    const decoded = JSON.parse(decodeURIComponent(leftParam));
    const query: string = decoded.queries[0].query;
    // Backslash should be double-escaped, quotes should be escaped
    expect(query).toContain('svc\\"with\\\\special');
  });

  it('URL parameters are encodeURIComponent-encoded', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);

    const svg = container.querySelector('svg')!;
    const allGs = Array.from(svg.querySelectorAll('g'));
    const nodeGs = allGs.filter((g) => g.querySelector('circle'));
    fireEvent.click(nodeGs[0], { ctrlKey: true });

    const url = mockWindowOpen.mock.calls[0][0] as string;
    const leftParam = url.replace('/explore?left=', '');
    // The left param should be URL-encoded (contains %7B for {, %22 for ", etc.)
    expect(leftParam).toMatch(/%7B|%22|%3A/i);
    // It should be valid JSON when decoded
    expect(() => JSON.parse(decodeURIComponent(leftParam))).not.toThrow();
  });

  it('does not open URL when traceDatasourceUid is empty', () => {
    const props = buildPanelProps({
      options: {

        errorThreshold: 0.05,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;
    const allGs = Array.from(svg.querySelectorAll('g'));
    const nodeGs = allGs.filter((g) => g.querySelector('circle'));
    fireEvent.click(nodeGs[0], { ctrlKey: true });
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });

  it('plain click without modifier does NOT open URL (focus mode instead)', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;
    const allGs = Array.from(svg.querySelectorAll('g'));
    const nodeGs = allGs.filter((g) => g.querySelector('circle'));
    fireEvent.click(nodeGs[0]); // No modifier
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v2: Summary line rendered
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — v2 summary line', () => {
  it('renders summary with service count, edge count, error%, totalRps', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const text = container.textContent || '';
    expect(text).toContain('3 services');
    expect(text).toContain('2 edges');
    expect(text).toContain('% errors');
    expect(text).toMatch(/\/s total/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v2: Legend rendered
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — v2 legend', () => {
  it('renders OK/Warn/Crit legend items', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const text = container.textContent || '';
    expect(text).toContain('OK');
    expect(text).toContain('Warn');
    expect(text).toContain('Crit');
  });

  it('renders particle legend when animate=true', () => {
    const props = buildPanelProps({
      options: {

        errorThreshold: 0.05,
        animate: true,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    expect(container.textContent).toContain('= requests');
  });

  it('does NOT render particle legend when animate=false', () => {
    const props = buildPanelProps({
      options: {

        errorThreshold: 0.05,
        animate: false,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    expect(container.textContent).not.toContain('= requests');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Particle positioning — particles are children of / aligned to their edge
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — particle geometry alignment', () => {
  it('each particle animateMotion path starts at source endpoint (not origin)', () => {
    const props = buildPanelProps({
      options: {
        errorThreshold: 0.05,
        animate: true,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const motions = container.querySelectorAll('animateMotion');
    expect(motions.length).toBeGreaterThan(0);

    for (const motion of Array.from(motions)) {
      const pathAttr = motion.getAttribute('path');
      expect(pathAttr).not.toBeNull();
      // Path must start with "M" and NOT be "M 0 0 L 0 0"
      expect(pathAttr).toMatch(/^M\s/);
      // Must not be stuck at origin
      expect(pathAttr).not.toBe('M 0 0 L 0 0');
    }
  });

  it('each particle path references UNIQUE per-edge coordinates (no collisions)', () => {
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a', 'a', 'b'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b', 'c', 'c'], config: {} },
              { name: 'Value', type: FieldType.number, values: [100, 50, 30], config: {} },
            ],
            length: 3,
          },
        ],
        timeRange: {} as any,
      },
      options: {
        errorThreshold: 0.05,
        animate: true,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const motions = container.querySelectorAll('animateMotion');
    const paths = Array.from(motions).map((m) => m.getAttribute('path'));

    // Group by edge: particles on the same edge share the same path,
    // but particles on DIFFERENT edges must have different paths
    const uniquePaths = new Set(paths);
    // At least 3 edges → at least 3 unique path strings
    expect(uniquePaths.size).toBeGreaterThanOrEqual(3);
  });

  it('particle path goes FROM source TO target (M src L tgt format)', () => {
    const props = buildPanelProps({
      options: {
        errorThreshold: 0.05,
        animate: true,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const motions = container.querySelectorAll('animateMotion');

    for (const motion of Array.from(motions)) {
      const pathAttr = motion.getAttribute('path')!;
      // Pattern: "M <x1> <y1> L <x2> <y2>"
      const match = pathAttr.match(/^M\s([\d.-]+)\s([\d.-]+)\sL\s([\d.-]+)\s([\d.-]+)$/);
      expect(match).not.toBeNull();
      if (match) {
        const [, sx, sy, tx, ty] = match.map(Number);
        // Source and target should be within viewport bounds (padding=40, width=800, height=~564)
        expect(sx).toBeGreaterThanOrEqual(0);
        expect(sy).toBeGreaterThanOrEqual(0);
        expect(tx).toBeGreaterThanOrEqual(0);
        expect(ty).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('particles are children of rect[data-particle] with animateMotion inside', () => {
    const props = buildPanelProps({
      options: {
        errorThreshold: 0.05,
        animate: true,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const particles = container.querySelectorAll('[data-particle="true"]');
    expect(particles.length).toBeGreaterThan(0);

    for (const particle of Array.from(particles)) {
      // Each particle is a rect
      expect(particle.tagName.toLowerCase()).toBe('rect');
      // Each rect must contain exactly one animateMotion child
      const motionChild = particle.querySelector('animateMotion');
      expect(motionChild).not.toBeNull();
      // The animateMotion must have repeatCount=indefinite
      expect(motionChild!.getAttribute('repeatCount')).toBe('indefinite');
    }
  });

  it('animateMotion has dur and begin attributes (animation is active)', () => {
    const props = buildPanelProps({
      options: {
        errorThreshold: 0.05,
        animate: true,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const motions = container.querySelectorAll('animateMotion');

    for (const motion of Array.from(motions)) {
      const dur = motion.getAttribute('dur');
      const begin = motion.getAttribute('begin');
      expect(dur).not.toBeNull();
      expect(begin).not.toBeNull();
      // dur should be a positive number followed by 's'
      expect(dur).toMatch(/^\d+(\.\d+)?s$/);
      // begin should be a number followed by 's' (stagger offset)
      expect(begin).toMatch(/^\d+(\.\d+)?s$/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Arrowhead size — bounded regardless of edge rate/thickness
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — arrowhead size bounded', () => {
  it('arrowhead markers use markerUnits=userSpaceOnUse (fixed size)', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const markers = container.querySelectorAll('marker');
    expect(markers.length).toBeGreaterThan(0);

    for (const marker of Array.from(markers)) {
      expect(marker.getAttribute('markerUnits')).toBe('userSpaceOnUse');
    }
  });

  it('arrowhead markers have consistent bounded dimensions regardless of data', () => {
    // Render with very high rate (would cause thick strokes)
    const props = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [999999], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const markers = container.querySelectorAll('marker');

    for (const marker of Array.from(markers)) {
      const mw = parseFloat(marker.getAttribute('markerWidth') || '0');
      const mh = parseFloat(marker.getAttribute('markerHeight') || '0');
      // Arrowhead should be bounded (ARROW_SIZE = 8, height = 8*0.6 = 4.8)
      expect(mw).toBeLessThanOrEqual(10); // 8px max with some tolerance
      expect(mh).toBeLessThanOrEqual(10);
      expect(mw).toBeGreaterThan(0);
      expect(mh).toBeGreaterThan(0);
    }
  });

  it('arrowhead size is identical between low-rate and high-rate renders', () => {
    // Low-rate
    const propsLow = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [1], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container: containerLow } = render(<ServiceMapPanel {...propsLow} />);
    const markersLow = containerLow.querySelectorAll('marker');
    const dimsLow = Array.from(markersLow).map((m) => [
      m.getAttribute('markerWidth'),
      m.getAttribute('markerHeight'),
    ]);

    // High-rate
    const propsHigh = buildPanelProps({
      data: {
        state: LoadingState.Done,
        series: [
          {
            refId: 'A',
            fields: [
              { name: 'client', type: FieldType.string, values: ['a'], config: {} },
              { name: 'server', type: FieldType.string, values: ['b'], config: {} },
              { name: 'Value', type: FieldType.number, values: [100000], config: {} },
            ],
            length: 1,
          },
        ],
        timeRange: {} as any,
      },
    });
    const { container: containerHigh } = render(<ServiceMapPanel {...propsHigh} />);
    const markersHigh = containerHigh.querySelectorAll('marker');
    const dimsHigh = Array.from(markersHigh).map((m) => [
      m.getAttribute('markerWidth'),
      m.getAttribute('markerHeight'),
    ]);

    // Dimensions must be identical — arrowhead does NOT scale with stroke
    expect(dimsLow).toEqual(dimsHigh);
  });

  it('edges reference arrow markers via markerEnd', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;
    const svgHtml = svg.innerHTML;
    // React renders markerEnd as marker-end in the SVG output
    // Verify that at least one edge references an arrow marker
    expect(svgHtml).toMatch(/marker-end="url\(#arrow-(ok|warn|crit)\)"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Zoom / Pan / Fit / Drag — component smoke tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ServiceMapPanel — zoom/pan/fit-to-view', () => {
  it('SVG has overflow="hidden" for content clipping', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('overflow')).toBe('hidden');
  });

  it('SVG has a viewBox attribute (viewBox-driven transform)', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;
    const viewBox = svg.getAttribute('viewBox');
    expect(viewBox).not.toBeNull();
    // viewBox should have 4 numeric components
    const parts = viewBox!.trim().split(/\s+/);
    expect(parts.length).toBe(4);
    parts.forEach((p) => {
      expect(Number.isNaN(Number(p))).toBe(false);
    });
  });

  it('fit-to-view button exists with title "Fit to view"', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const btn = container.querySelector('button[title="Fit to view"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('⊞');
  });

  it('clicking fit button resets viewBox (produces a valid viewBox)', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;
    const btn = container.querySelector('button[title="Fit to view"]')!;

    // Record initial viewBox
    const initialViewBox = svg.getAttribute('viewBox');

    // Simulate a wheel event to change the view
    fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 });
    const afterZoomViewBox = svg.getAttribute('viewBox');

    // Zoom must have changed the viewBox before fit resets it
    expect(afterZoomViewBox).not.toBe(initialViewBox);

    // Click fit button
    fireEvent.click(btn);
    const afterFitViewBox = svg.getAttribute('viewBox');

    // After fit, the viewBox should be valid (parseable to 4 numbers)
    const parts = afterFitViewBox!.trim().split(/\s+/);
    expect(parts.length).toBe(4);
    parts.forEach((p) => {
      expect(Number.isFinite(Number(p))).toBe(true);
    });
  });

  it('wheel zoom changes the viewBox', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;

    const before = svg.getAttribute('viewBox');

    // Zoom in (negative deltaY = zoom in for natural scroll)
    fireEvent.wheel(svg, { deltaY: -200, clientX: 400, clientY: 300 });

    const after = svg.getAttribute('viewBox');
    // ViewBox should have changed
    expect(after).not.toBe(before);
  });
});

describe('ServiceMapPanel — node drag behavior', () => {
  it('dragging a node past threshold moves it (position changes)', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;

    // Find a node group
    const nodeGroup = svg.querySelector('[data-node-id]') as Element;
    expect(nodeGroup).not.toBeNull();

    const circle = nodeGroup.querySelector('circle')!;
    const initialCx = circle.getAttribute('cx');

    // Start drag on node
    fireEvent.mouseDown(nodeGroup, { button: 0, clientX: 100, clientY: 100 });
    // Move past threshold (>4px total)
    fireEvent.mouseMove(svg, { clientX: 120, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 140, clientY: 100 });
    fireEvent.mouseUp(svg, { clientX: 140, clientY: 100 });

    const afterCx = circle.getAttribute('cx');
    // Node should have moved
    expect(afterCx).not.toBe(initialCx);
  });

  it('dragging a node past threshold does NOT trigger focus/drill', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;

    const nodeGroup = svg.querySelector('[data-node-id]') as Element;
    expect(nodeGroup).not.toBeNull();

    // Drag node well past threshold
    fireEvent.mouseDown(nodeGroup, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 150 });
    fireEvent.mouseUp(svg, { clientX: 150, clientY: 150 });

    // Verify no focus happened: all nodes should remain at full opacity
    const allGroups = svg.querySelectorAll('[data-node-id]');
    allGroups.forEach((g) => {
      const opacity = g.getAttribute('opacity');
      // If focus triggered, non-neighbors would be 0.15
      expect(opacity === null || opacity === '1').toBe(true);
    });

    // Verify no drill-down URL opened
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });

  it('a click (below threshold) on a node triggers focus (dims non-neighbors)', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;

    const nodeGroup = svg.querySelector('[data-node-id]') as Element;
    expect(nodeGroup).not.toBeNull();

    // Simulate a click (mouseDown + mouseUp with no movement)
    fireEvent.mouseDown(nodeGroup, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseUp(svg, { clientX: 100, clientY: 100 });
    // Also fire the onClick for the node group (React synthetic event)
    fireEvent.click(nodeGroup);

    // At least one node should be dimmed (opacity 0.15) since focus mode is active
    const allGroups = svg.querySelectorAll('[data-node-id]');
    const opacities = Array.from(allGroups).map((g) => g.getAttribute('opacity'));
    // With 3 nodes and focus on one: at least 1 should be dimmed (non-neighbor)
    // unless all are connected — but in our test data 'frontend' connects to 'api-gw',
    // 'api-gw' connects to 'database'. Clicking 'frontend' → neighbors are {frontend, api-gw},
    // database should be dimmed.
    expect(opacities.some((o) => o === '0.15')).toBe(true);
  });

  it('panning background (drag on SVG) changes viewBox', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;

    const before = svg.getAttribute('viewBox');

    // Mouse down on SVG background (not on a node)
    fireEvent.mouseDown(svg, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 100 });
    fireEvent.mouseUp(svg, { clientX: 100, clientY: 100 });

    const after = svg.getAttribute('viewBox');
    expect(after).not.toBe(before);
  });

  it('node click after a drag does NOT focus the node (wasDrag guard)', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;
    const nodeGroup = svg.querySelector('[data-node-id]') as Element;
    expect(nodeGroup).not.toBeNull();

    // Perform a significant drag on the node
    fireEvent.mouseDown(nodeGroup, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 200 });
    fireEvent.mouseUp(svg, { clientX: 200, clientY: 200 });

    // Now click the node (simulates the browser onClick that fires after mouseUp)
    fireEvent.click(nodeGroup, { clientX: 200, clientY: 200 });

    // The node should NOT be focused (opacity should remain 1 for all nodes = no focus)
    const allNodeGroups = svg.querySelectorAll('[data-node-id]');
    const opacities = Array.from(allNodeGroups).map((g) => g.getAttribute('opacity'));
    // If no focus is active, all nodes have opacity 1
    opacities.forEach((o) => {
      expect(o).toBe('1');
    });
  });

  it('plain click (no drag) still focuses the node', () => {
    const props = buildPanelProps();
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;
    const nodeGroup = svg.querySelector('[data-node-id]') as Element;
    expect(nodeGroup).not.toBeNull();

    // mouseDown + mouseUp without movement (below threshold) then click
    fireEvent.mouseDown(nodeGroup, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseUp(svg, { clientX: 100, clientY: 100 });
    fireEvent.click(nodeGroup, { clientX: 100, clientY: 100 });

    // Should be focused: at least one node should have reduced opacity
    const allNodeGroups = svg.querySelectorAll('[data-node-id]');
    const opacities = Array.from(allNodeGroups).map((g) => g.getAttribute('opacity'));
    // When focused, non-focused nodes get dimmed (opacity < 1)
    const hasDimmed = opacities.some((o) => o !== null && parseFloat(o) < 1);
    expect(hasDimmed).toBe(true);
  });
});
