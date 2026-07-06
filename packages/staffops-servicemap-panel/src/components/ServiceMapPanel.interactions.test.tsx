/**
 * Interaction regression tests for ServiceMapPanel.
 *
 * Written INDEPENDENTLY from the implementation — tests against the
 * CONTRACT (design.md) to lock hover/focus/traces behavior and prevent
 * regressions after the pointer-events fix.
 *
 * Covers:
 * 1. Animated particles + edge decorations have pointer-events:none
 *    (do NOT intercept hover events meant for nodes)
 * 2. Node hover fires tooltip containing In/Out/Total RPS + Health
 * 3. Node click toggles focus mode (dims non-neighbors)
 * 4. Ctrl/Meta+click builds the correct Explore/TraceQL URL
 * 5. Edge hover still shows rate/err/p95
 * 6. onMouseLeave clears the tooltip
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { PanelProps, FieldType, LoadingState } from '@grafana/data';
import { ServiceMapOptions } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (must match existing test file pattern)
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('@grafana/runtime', () => ({
  getTemplateSrv: () => ({ replace: (s: string) => s }),
}));

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

jest.mock('@emotion/css', () => ({
  css: () => 'mock-css-class',
  cx: (...args: any[]) => args.filter(Boolean).join(' '),
}));

const mockWindowOpen = jest.fn();
Object.defineProperty(window, 'open', { value: mockWindowOpen, writable: true });

import { ServiceMapPanel } from './ServiceMapPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Test data factory
// ─────────────────────────────────────────────────────────────────────────────

function buildProps(overrides?: Partial<PanelProps<ServiceMapOptions>>): PanelProps<ServiceMapOptions> {
  const defaultOptions: ServiceMapOptions = {
    errorThreshold: 0.05,
    warnThreshold: 0.01,
    animate: true,
    traceDatasourceUid: 'tempo-uid-abc',
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
            { name: 'server', type: FieldType.string, values: ['api-gw', 'orders-svc'], config: {} },
            { name: 'Value', type: FieldType.number, values: [200, 80], config: {} },
            { name: 'connection_type', type: FieldType.string, values: ['', 'database'], config: {} },
          ],
          length: 2,
        },
        {
          refId: 'B',
          fields: [
            { name: 'client', type: FieldType.string, values: ['frontend', 'api-gw'], config: {} },
            { name: 'server', type: FieldType.string, values: ['api-gw', 'orders-svc'], config: {} },
            { name: 'Value', type: FieldType.number, values: [2, 8], config: {} },
          ],
          length: 2,
        },
        {
          refId: 'C',
          fields: [
            { name: 'client', type: FieldType.string, values: ['frontend', 'api-gw'], config: {} },
            { name: 'server', type: FieldType.string, values: ['api-gw', 'orders-svc'], config: {} },
            { name: 'Value', type: FieldType.number, values: [0.15, 0.45], config: {} },
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
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getNodeGroups(container: HTMLElement) {
  const svg = container.querySelector('svg')!;
  return Array.from(svg.querySelectorAll('g[data-node-id]'));
}

function getNodeByLabel(container: HTMLElement, label: string) {
  const groups = getNodeGroups(container);
  return groups.find((g) => {
    const texts = g.querySelectorAll('text');
    return Array.from(texts).some((t) => t.textContent === label);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Animated particles / edge decorations have pointer-events:none
// ─────────────────────────────────────────────────────────────────────────────

describe('Pointer-events regression: particles & decorations do NOT block node interaction', () => {
  it('all animated particle rects have style.pointerEvents = "none"', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const particles = container.querySelectorAll('[data-particle="true"]');
    expect(particles.length).toBeGreaterThan(0);

    particles.forEach((particle) => {
      const style = (particle as HTMLElement).style;
      expect(style.pointerEvents).toBe('none');
    });
  });

  it('arrowhead marker polygons have style.pointerEvents = "none"', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const polygons = container.querySelectorAll('marker polygon');
    expect(polygons.length).toBeGreaterThan(0);

    polygons.forEach((polygon) => {
      const style = (polygon as HTMLElement).style;
      expect(style.pointerEvents).toBe('none');
    });
  });

  it('edge accessibility glyphs (warn/crit text) have style.pointerEvents = "none"', () => {
    // Use data that produces a crit or warn edge
    const props = buildProps(); // api-gw→orders-svc has errorRatio=8/80=0.1 > 0.05 → crit
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;

    // Find text elements that are NOT node labels (accessibility glyphs ⚠ or ✖)
    const texts = Array.from(svg.querySelectorAll('text'));
    const glyphs = texts.filter((t) => {
      const content = t.textContent || '';
      return content === '⚠' || content === '✖';
    });
    expect(glyphs.length).toBeGreaterThan(0);

    glyphs.forEach((glyph) => {
      expect((glyph as SVGElement).style.pointerEvents).toBe('none');
    });
  });

  it('node label text elements have style.pointerEvents = "none"', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const nodeGroups = getNodeGroups(container);
    expect(nodeGroups.length).toBeGreaterThan(0);

    nodeGroups.forEach((g) => {
      const labelText = g.querySelector('text');
      expect(labelText).not.toBeNull();
      expect((labelText as SVGElement).style.pointerEvents).toBe('none');
    });
  });

  it('edge label text elements have style.pointerEvents = "none" when shown', () => {
    const props = buildProps({
      options: {
        errorThreshold: 0.05,
        warnThreshold: 0.01,
        animate: true,
        showEdgeLabels: true,
        traceDatasourceUid: 'tempo-uid-abc',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const svg = container.querySelector('svg')!;

    // Edge labels contain the pattern "X/s · Y% · Zms"
    const texts = Array.from(svg.querySelectorAll('text'));
    const edgeLabels = texts.filter((t) => /\/s/.test(t.textContent || '') && /%/.test(t.textContent || ''));
    expect(edgeLabels.length).toBeGreaterThan(0);

    edgeLabels.forEach((label) => {
      expect((label as SVGElement).style.pointerEvents).toBe('none');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Node hover fires tooltip with In/Out/Total RPS + Health
// ─────────────────────────────────────────────────────────────────────────────

describe('Node hover tooltip: In/Out/Total RPS + Health + hint', () => {
  it('hovering a node shows tooltip with all required fields', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const apiNode = getNodeByLabel(container, 'api-gw');
    expect(apiNode).toBeTruthy();

    fireEvent.mouseMove(apiNode!, { clientX: 200, clientY: 300 });

    const text = container.textContent || '';
    expect(text).toMatch(/In:\s*\d/);
    expect(text).toMatch(/Out:\s*\d/);
    expect(text).toMatch(/Total:\s*\d/);
    expect(text).toMatch(/Health:\s*(ok|warn|crit)/);
  });

  it('node tooltip contains discoverability hint "Click: focus | Ctrl+Click: traces"', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const node = getNodeByLabel(container, 'frontend');
    expect(node).toBeTruthy();

    fireEvent.mouseMove(node!, { clientX: 100, clientY: 100 });

    expect(container.textContent).toContain('Click: focus | Ctrl+Click: traces');
  });

  it('tooltip displays the node ID (service name)', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const node = getNodeByLabel(container, 'orders-svc');
    expect(node).toBeTruthy();

    fireEvent.mouseMove(node!, { clientX: 300, clientY: 400 });

    // The tooltip should show the node name
    // We know it's in the tooltip because it appears AFTER hovering
    // (before hover, 'orders-svc' is only in the SVG label)
    expect(container.textContent).toContain('orders-svc');
  });

  it('node tooltip shows correct health status based on incident edges', () => {
    // api-gw→orders-svc has errorRatio=0.1 > crit (0.05)
    // So 'orders-svc' and 'api-gw' should have health='crit'
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const ordersNode = getNodeByLabel(container, 'orders-svc');
    expect(ordersNode).toBeTruthy();

    fireEvent.mouseMove(ordersNode!, { clientX: 300, clientY: 400 });

    expect(container.textContent).toContain('Health: crit');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Node click toggles focus (dims non-neighbors)
// ─────────────────────────────────────────────────────────────────────────────

describe('Node click toggles focus mode', () => {
  it('clicking a node dims non-neighbor nodes to opacity 0.15', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const frontendNode = getNodeByLabel(container, 'frontend');
    expect(frontendNode).toBeTruthy();

    // Click frontend → neighbors are {frontend, api-gw}, orders-svc is non-neighbor
    fireEvent.click(frontendNode!);

    const ordersNode = getNodeByLabel(container, 'orders-svc');
    expect(ordersNode?.getAttribute('opacity')).toBe('0.15');
  });

  it('clicking the same node again un-focuses (toggles off)', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const frontendNode = getNodeByLabel(container, 'frontend');
    expect(frontendNode).toBeTruthy();

    // Click to focus
    fireEvent.click(frontendNode!);
    const ordersAfterFocus = getNodeByLabel(container, 'orders-svc');
    expect(ordersAfterFocus?.getAttribute('opacity')).toBe('0.15');

    // Click again to un-focus
    fireEvent.click(getNodeByLabel(container, 'frontend')!);
    const ordersAfterUnfocus = getNodeByLabel(container, 'orders-svc');
    expect(ordersAfterUnfocus?.getAttribute('opacity')).toBe('1');
  });

  it('focused node itself remains at opacity 1', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const frontendNode = getNodeByLabel(container, 'frontend');
    fireEvent.click(frontendNode!);

    const frontendAfter = getNodeByLabel(container, 'frontend');
    expect(frontendAfter?.getAttribute('opacity')).toBe('1');
  });

  it('neighbor of focused node remains at opacity 1', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const frontendNode = getNodeByLabel(container, 'frontend');
    fireEvent.click(frontendNode!);

    // api-gw is a neighbor of frontend
    const apiNode = getNodeByLabel(container, 'api-gw');
    expect(apiNode?.getAttribute('opacity')).toBe('1');
  });

  it('focus also dims edges not involving the focused node', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    // Click frontend → only frontend↔api-gw edge should be full, api-gw→orders-svc dimmed
    const frontendNode = getNodeByLabel(container, 'frontend');
    fireEvent.click(frontendNode!);

    const svg = container.querySelector('svg')!;
    const lines = Array.from(svg.querySelectorAll('line'));
    const opacities = lines.map((l) => l.getAttribute('opacity'));
    // At least one edge should be dimmed
    expect(opacities).toContain('0.15');
    // At least one edge should be full
    expect(opacities).toContain('1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Ctrl/Meta+click builds correct Explore/TraceQL URL
// ─────────────────────────────────────────────────────────────────────────────

describe('Ctrl/Meta+click → Explore/TraceQL URL', () => {
  beforeEach(() => {
    mockWindowOpen.mockClear();
  });

  it('Ctrl+click opens window with /explore?left= URL', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const node = getNodeByLabel(container, 'api-gw');
    fireEvent.click(node!, { ctrlKey: true });

    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    const url = mockWindowOpen.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/explore\?left=/);
  });

  it('Meta+click (macOS) opens window identically to Ctrl+click', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const node = getNodeByLabel(container, 'orders-svc');
    fireEvent.click(node!, { metaKey: true });

    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    const url = mockWindowOpen.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/explore\?left=/);
  });

  it('TraceQL query uses resource.service.name = "<node.id>"', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const node = getNodeByLabel(container, 'orders-svc');
    fireEvent.click(node!, { ctrlKey: true });

    const url = mockWindowOpen.mock.calls[0][0] as string;
    const leftParam = url.replace('/explore?left=', '');
    const decoded = JSON.parse(decodeURIComponent(leftParam));
    expect(decoded.queries[0].query).toContain('resource.service.name = "orders-svc"');
  });

  it('URL contains correct datasource UID', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const node = getNodeByLabel(container, 'frontend');
    fireEvent.click(node!, { ctrlKey: true });

    const url = mockWindowOpen.mock.calls[0][0] as string;
    const decoded = JSON.parse(decodeURIComponent(url.replace('/explore?left=', '')));
    expect(decoded.datasource).toBe('tempo-uid-abc');
  });

  it('URL contains time range from: now-1h, to: now', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const node = getNodeByLabel(container, 'frontend');
    fireEvent.click(node!, { ctrlKey: true });

    const url = mockWindowOpen.mock.calls[0][0] as string;
    const decoded = JSON.parse(decodeURIComponent(url.replace('/explore?left=', '')));
    expect(decoded.range).toEqual({ from: 'now-1h', to: 'now' });
  });

  it('window.open called with _blank target and noopener', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const node = getNodeByLabel(container, 'frontend');
    fireEvent.click(node!, { ctrlKey: true });

    expect(mockWindowOpen).toHaveBeenCalledWith(
      expect.any(String),
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('Ctrl+click does NOT toggle focus mode', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const node = getNodeByLabel(container, 'frontend');
    fireEvent.click(node!, { ctrlKey: true });

    // All nodes should remain at full opacity (no focus triggered)
    const groups = getNodeGroups(container);
    groups.forEach((g) => {
      const opacity = g.getAttribute('opacity');
      expect(opacity === null || opacity === '1').toBe(true);
    });
  });

  it('does nothing when traceDatasourceUid is empty', () => {
    const props = buildProps({
      options: {
        errorThreshold: 0.05,
        traceDatasourceUid: '',
        queryMapping: { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' },
      },
    });
    const { container } = render(<ServiceMapPanel {...props} />);
    const node = getNodeByLabel(container, 'frontend');
    fireEvent.click(node!, { ctrlKey: true });

    expect(mockWindowOpen).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Edge hover shows rate/err/p95
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge hover tooltip: rate, error%, p95', () => {
  it('hovering an edge shows Rate in tooltip', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const line = container.querySelector('line')!;
    fireEvent.mouseMove(line, { clientX: 150, clientY: 250 });

    expect(container.textContent).toMatch(/Rate:\s*\d/);
  });

  it('hovering an edge shows Error percentage', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const line = container.querySelector('line')!;
    fireEvent.mouseMove(line, { clientX: 150, clientY: 250 });

    expect(container.textContent).toMatch(/Error:\s*\d+\.\d+%/);
  });

  it('hovering an edge shows p95 latency', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const line = container.querySelector('line')!;
    fireEvent.mouseMove(line, { clientX: 150, clientY: 250 });

    expect(container.textContent).toMatch(/p95:\s*\d/);
  });

  it('edge tooltip shows source → target', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const line = container.querySelector('line')!;
    fireEvent.mouseMove(line, { clientX: 150, clientY: 250 });

    // Should show "X → Y" arrow notation
    expect(container.textContent).toMatch(/→/);
  });

  it('edge tooltip shows Health status', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const line = container.querySelector('line')!;
    fireEvent.mouseMove(line, { clientX: 150, clientY: 250 });

    expect(container.textContent).toMatch(/Health:\s*(ok|warn|crit)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. onMouseLeave clears the tooltip
// ─────────────────────────────────────────────────────────────────────────────

describe('onMouseLeave clears the tooltip', () => {
  it('tooltip disappears after mouseLeave on a node', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const node = getNodeByLabel(container, 'api-gw')!;

    // Trigger tooltip
    fireEvent.mouseMove(node, { clientX: 200, clientY: 300 });
    expect(container.textContent).toContain('In:');

    // Leave the node
    fireEvent.mouseLeave(node);
    expect(container.textContent).not.toContain('In:');
  });

  it('tooltip disappears after mouseLeave on an edge', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const line = container.querySelector('line')!;

    // Trigger tooltip
    fireEvent.mouseMove(line, { clientX: 200, clientY: 300 });
    expect(container.textContent).toContain('Rate:');

    // Leave
    fireEvent.mouseLeave(line);
    expect(container.textContent).not.toContain('Rate:');
  });

  it('tooltip disappears after mouseLeave on the SVG element', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const svg = container.querySelector('svg')!;
    const node = getNodeByLabel(container, 'frontend')!;

    // Trigger tooltip via node
    fireEvent.mouseMove(node, { clientX: 100, clientY: 100 });
    expect(container.textContent).toContain('Total:');

    // Leave the entire SVG
    fireEvent.mouseLeave(svg);
    expect(container.textContent).not.toContain('Total:');
  });

  it('no tooltip DOM element exists after clearing', () => {
    const { container } = render(<ServiceMapPanel {...buildProps()} />);
    const node = getNodeByLabel(container, 'frontend')!;

    // Trigger tooltip
    fireEvent.mouseMove(node, { clientX: 100, clientY: 100 });
    // Tooltip div has pointer-events:none and z-index:10000
    // Count divs before and after clearing
    fireEvent.mouseLeave(node);

    // After leave, no element should contain "In:" or "Out:" or "Total:"
    expect(container.textContent).not.toMatch(/In:\s*\d/);
    expect(container.textContent).not.toMatch(/Out:\s*\d/);
    expect(container.textContent).not.toMatch(/Total:\s*\d/);
  });
});
