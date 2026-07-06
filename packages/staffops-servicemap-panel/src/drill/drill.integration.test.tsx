/**
 * Tests for drill-into-node feature (client-side isolation):
 * - Double-click on a node isolates its reachable subgraph
 * - Isolation indicator renders with reset button
 * - Reset (button click / background click) restores full graph
 * - Single-click focus and Ctrl+click traces are preserved
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { PanelProps, FieldType, LoadingState } from '@grafana/data';
import { ServiceMapOptions } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('@grafana/runtime', () => ({
  getTemplateSrv: () => ({ replace: (s: string) => s }),
  locationService: { partial: jest.fn() },
}));

jest.mock('@grafana/ui', () => ({
  useTheme2: () => ({
    colors: {
      text: { primary: '#fff', secondary: '#aaa', link: '#66f' },
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

import { ServiceMapPanel } from '../components/ServiceMapPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Test data factory: A -> B -> C -> D, A -> E (branching)
// ─────────────────────────────────────────────────────────────────────────────

function buildDrillProps(): PanelProps<ServiceMapOptions> {
  const defaultOptions: ServiceMapOptions = {
    errorThreshold: 0.05,
    warnThreshold: 0.01,
    animate: false,
    traceDatasourceUid: 'tempo-uid',
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
            { name: 'client', type: FieldType.string, values: ['frontend', 'api-gw', 'api-gw', 'frontend'], config: {} },
            { name: 'server', type: FieldType.string, values: ['api-gw', 'orders-svc', 'redis-main', 'auth-svc'], config: {} },
            { name: 'Value', type: FieldType.number, values: [200, 80, 50, 60], config: {} },
            { name: 'connection_type', type: FieldType.string, values: ['', '', 'database', ''], config: {} },
            { name: 'client_deployment_environment', type: FieldType.string, values: ['prd', 'prd', 'prd', 'prd'], config: {} },
            { name: 'server_deployment_environment', type: FieldType.string, values: ['prd', 'prd', 'prd', 'prd'], config: {} },
            { name: 'client_service_namespace', type: FieldType.string, values: ['web', 'gateway', 'gateway', 'web'], config: {} },
            { name: 'server_service_namespace', type: FieldType.string, values: ['gateway', 'orders', 'cache', 'auth'], config: {} },
          ],
          length: 4,
        },
        {
          refId: 'B',
          fields: [
            { name: 'client', type: FieldType.string, values: ['frontend', 'api-gw', 'api-gw', 'frontend'], config: {} },
            { name: 'server', type: FieldType.string, values: ['api-gw', 'orders-svc', 'redis-main', 'auth-svc'], config: {} },
            { name: 'Value', type: FieldType.number, values: [2, 1, 0, 1], config: {} },
          ],
          length: 4,
        },
        {
          refId: 'C',
          fields: [
            { name: 'client', type: FieldType.string, values: ['frontend', 'api-gw', 'api-gw', 'frontend'], config: {} },
            { name: 'server', type: FieldType.string, values: ['api-gw', 'orders-svc', 'redis-main', 'auth-svc'], config: {} },
            { name: 'Value', type: FieldType.number, values: [0.1, 0.2, 0.05, 0.1], config: {} },
          ],
          length: 4,
        },
      ],
      timeRange: { from: new Date(), to: new Date(), raw: { from: 'now-1h', to: 'now' } } as any,
    },
    options: defaultOptions,
    width: 800,
    height: 600,
    timeRange: { from: new Date(), to: new Date(), raw: { from: 'now-1h', to: 'now' } } as any,
    timeZone: 'utc',
    fieldConfig: { defaults: {}, overrides: [] } as any,
    renderCounter: 0,
    transparent: false,
    replaceVariables: (s: string) => '$__all',
    onOptionsChange: jest.fn(),
    onFieldConfigChange: jest.fn(),
    onChangeTimeRange: jest.fn(),
    eventBus: { subscribe: jest.fn(), getStream: jest.fn(), publish: jest.fn(), removeAllListeners: jest.fn(), newScopedBus: jest.fn() } as any,
    title: 'Service Map',
  } as any;
}

function getNodeByDataId(container: HTMLElement, id: string) {
  return container.querySelector(`[data-node-id="${id}"]`);
}

function getNodeOpacity(container: HTMLElement, id: string): string | null {
  const node = getNodeByDataId(container, id);
  return node?.getAttribute('opacity') ?? null;
}

describe('Drill isolation (client-side reachable subgraph)', () => {
  beforeEach(() => {
    mockWindowOpen.mockClear();
  });

  describe('Double-click isolates reachable subgraph', () => {
    it('double-click on api-gw isolates its connected component', () => {
      const { container } = render(<ServiceMapPanel {...buildDrillProps()} />);

      const apiGwNode = getNodeByDataId(container, 'api-gw');
      expect(apiGwNode).toBeTruthy();

      fireEvent.dblClick(apiGwNode!);

      // api-gw is connected to: frontend (upstream), orders-svc, redis-main (downstream)
      // auth-svc is NOT connected to api-gw (only to frontend)
      // BUT frontend connects to api-gw, so auth-svc is reachable via frontend upstream!
      // Actually: frontend -> api-gw -> orders-svc, api-gw -> redis-main, frontend -> auth-svc
      // From api-gw: upstream = {frontend}, downstream = {orders-svc, redis-main}
      // From frontend (via upstream of api-gw): downstream = {auth-svc} ... but that's from frontend
      // reachableSubgraph from api-gw: downstream = orders-svc, redis-main; upstream = frontend
      // Then from frontend upstream: nothing more. From frontend downstream: auth-svc
      // Wait - the BFS goes: from api-gw upstream finds frontend, then from frontend upstream finds nothing more
      // but downstream from frontend = api-gw, auth-svc... BUT downstream BFS started from api-gw, not frontend
      // Let me re-read the algorithm: it's independent BFS in each direction from the ORIGIN
      // Downstream from api-gw: orders-svc, redis-main
      // Upstream from api-gw: frontend -> then from frontend upstream: nothing
      // So result = {api-gw, orders-svc, redis-main, frontend}
      // auth-svc is NOT in the reachable set from api-gw (it's only reachable going downstream from frontend, but we only go upstream from api-gw)

      expect(getNodeOpacity(container, 'api-gw')).toBe('1');
      expect(getNodeOpacity(container, 'frontend')).toBe('1');
      expect(getNodeOpacity(container, 'orders-svc')).toBe('1');
      expect(getNodeOpacity(container, 'redis-main')).toBe('1');
      expect(getNodeOpacity(container, 'auth-svc')).toBe('0.08');
    });

    it('double-click on frontend isolates all nodes (it connects to everything)', () => {
      const { container } = render(<ServiceMapPanel {...buildDrillProps()} />);

      const frontendNode = getNodeByDataId(container, 'frontend');
      fireEvent.dblClick(frontendNode!);

      // frontend downstream: api-gw, auth-svc; then from api-gw: orders-svc, redis-main
      // All nodes are reachable from frontend downstream
      expect(getNodeOpacity(container, 'frontend')).toBe('1');
      expect(getNodeOpacity(container, 'api-gw')).toBe('1');
      expect(getNodeOpacity(container, 'orders-svc')).toBe('1');
      expect(getNodeOpacity(container, 'redis-main')).toBe('1');
      expect(getNodeOpacity(container, 'auth-svc')).toBe('1');
    });

    it('double-click on orders-svc (leaf) isolates its upstream chain', () => {
      const { container } = render(<ServiceMapPanel {...buildDrillProps()} />);

      const ordersNode = getNodeByDataId(container, 'orders-svc');
      fireEvent.dblClick(ordersNode!);

      // orders-svc upstream: api-gw -> frontend
      // orders-svc downstream: nothing
      expect(getNodeOpacity(container, 'orders-svc')).toBe('1');
      expect(getNodeOpacity(container, 'api-gw')).toBe('1');
      expect(getNodeOpacity(container, 'frontend')).toBe('1');
      // auth-svc and redis-main are NOT reachable from orders-svc
      expect(getNodeOpacity(container, 'auth-svc')).toBe('0.08');
      expect(getNodeOpacity(container, 'redis-main')).toBe('0.08');
    });
  });

  describe('Isolation indicator and reset', () => {
    it('shows isolation indicator with node name after double-click', () => {
      const { container } = render(<ServiceMapPanel {...buildDrillProps()} />);

      const apiGwNode = getNodeByDataId(container, 'api-gw');
      fireEvent.dblClick(apiGwNode!);

      const indicator = screen.getByTestId('isolation-indicator');
      expect(indicator).toBeInTheDocument();
      expect(indicator.textContent).toContain('api-gw');
    });

    it('does not show isolation indicator initially', () => {
      render(<ServiceMapPanel {...buildDrillProps()} />);
      expect(screen.queryByTestId('isolation-indicator')).not.toBeInTheDocument();
    });

    it('clicking reset button restores full graph', () => {
      const { container } = render(<ServiceMapPanel {...buildDrillProps()} />);

      const ordersNode = getNodeByDataId(container, 'orders-svc');
      fireEvent.dblClick(ordersNode!);

      // auth-svc should be dimmed
      expect(getNodeOpacity(container, 'auth-svc')).toBe('0.08');

      // Click reset
      const resetBtn = screen.getByTestId('isolation-reset');
      fireEvent.click(resetBtn);

      // All nodes back to full opacity
      expect(getNodeOpacity(container, 'auth-svc')).toBe('1');
      expect(screen.queryByTestId('isolation-indicator')).not.toBeInTheDocument();
    });

    it('double-click same node again toggles isolation off', () => {
      const { container } = render(<ServiceMapPanel {...buildDrillProps()} />);

      const apiGwNode = getNodeByDataId(container, 'api-gw');
      fireEvent.dblClick(apiGwNode!);
      expect(screen.getByTestId('isolation-indicator')).toBeInTheDocument();

      fireEvent.dblClick(getNodeByDataId(container, 'api-gw')!);
      expect(screen.queryByTestId('isolation-indicator')).not.toBeInTheDocument();
    });
  });

  describe('Existing interactions preserved', () => {
    it('single click still toggles focus (1-hop blast radius), no isolation', () => {
      const { container } = render(<ServiceMapPanel {...buildDrillProps()} />);

      const apiGwNode = getNodeByDataId(container, 'api-gw');
      fireEvent.click(apiGwNode!);

      // Focus dims non-neighbors at 0.15 (not 0.08 like isolation)
      // api-gw neighbors: frontend (in), orders-svc (out), redis-main (out)
      // auth-svc is NOT a neighbor of api-gw
      expect(getNodeOpacity(container, 'auth-svc')).toBe('0.15');
      expect(screen.queryByTestId('isolation-indicator')).not.toBeInTheDocument();
    });

    it('Ctrl+click still opens traces URL', () => {
      const { container } = render(<ServiceMapPanel {...buildDrillProps()} />);

      const ordersNode = getNodeByDataId(container, 'orders-svc');
      fireEvent.click(ordersNode!, { ctrlKey: true });

      expect(mockWindowOpen).toHaveBeenCalled();
    });

    it('double-click does NOT call locationService.partial', () => {
      const { locationService } = jest.requireMock('@grafana/runtime');
      locationService.partial.mockClear();

      const { container } = render(<ServiceMapPanel {...buildDrillProps()} />);

      const apiGwNode = getNodeByDataId(container, 'api-gw');
      fireEvent.dblClick(apiGwNode!);

      expect(locationService.partial).not.toHaveBeenCalled();
    });
  });
});
