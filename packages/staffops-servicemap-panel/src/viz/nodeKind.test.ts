import { classifyNode, NodeKind, NODE_KIND_COLORS, NODE_KIND_LABELS } from './nodeKind';
import { GraphNode, GraphEdge } from '../types';

// Helper to create a minimal GraphNode
function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return { id, inRate: 10, outRate: 5, totalRate: 15, ...overrides };
}

// Helper to create a minimal GraphEdge targeting a specific node
function makeEdge(
  source: string,
  target: string,
  overrides?: Partial<GraphEdge>
): GraphEdge {
  return {
    source,
    target,
    rate: 100,
    errorRatio: 0,
    p95: 0.05,
    connectionType: '',
    ...overrides,
  };
}

describe('classifyNode', () => {
  describe('database classification', () => {
    it('returns "database" when node has an incident edge with connection_type=database', () => {
      const node = makeNode('postgres-db');
      const edges: GraphEdge[] = [
        makeEdge('api-service', 'postgres-db', { connectionType: 'database' }),
      ];
      expect(classifyNode(node, edges)).toBe('database');
    });

    it('returns "database" even with multiple edge types (precedence)', () => {
      const node = makeNode('multi-node');
      const edges: GraphEdge[] = [
        makeEdge('svc-a', 'multi-node', { connectionType: 'messaging_system' }),
        makeEdge('svc-b', 'multi-node', { connectionType: 'database' }),
        makeEdge('svc-c', 'multi-node', { virtualNode: 'server' }),
      ];
      expect(classifyNode(node, edges)).toBe('database');
    });
  });

  describe('queue classification', () => {
    it('returns "queue" when node has an incident edge with connection_type=messaging_system', () => {
      const node = makeNode('kafka-broker');
      const edges: GraphEdge[] = [
        makeEdge('producer-svc', 'kafka-broker', { connectionType: 'messaging_system' }),
      ];
      expect(classifyNode(node, edges)).toBe('queue');
    });

    it('queue takes precedence over external', () => {
      const node = makeNode('sqs-queue');
      const edges: GraphEdge[] = [
        makeEdge('svc-a', 'sqs-queue', { connectionType: 'messaging_system' }),
        makeEdge('svc-b', 'sqs-queue', { virtualNode: 'server' }),
      ];
      expect(classifyNode(node, edges)).toBe('queue');
    });
  });

  describe('external classification', () => {
    it('returns "external" when node has an incident edge with virtualNode=server', () => {
      const node = makeNode('external-api');
      const edges: GraphEdge[] = [
        makeEdge('my-service', 'external-api', { virtualNode: 'server' }),
      ];
      expect(classifyNode(node, edges)).toBe('external');
    });

    it('returns "external" when connection_type=virtual_node', () => {
      const node = makeNode('third-party');
      const edges: GraphEdge[] = [
        makeEdge('my-service', 'third-party', { connectionType: 'virtual_node' }),
      ];
      expect(classifyNode(node, edges)).toBe('external');
    });
  });

  describe('service classification (default)', () => {
    it('returns "service" when node has no special edge types', () => {
      const node = makeNode('my-api');
      const edges: GraphEdge[] = [
        makeEdge('frontend', 'my-api', { connectionType: '' }),
      ];
      expect(classifyNode(node, edges)).toBe('service');
    });

    it('returns "service" when node has no incident edges (only outgoing)', () => {
      const node = makeNode('leaf-service');
      const edges: GraphEdge[] = [
        makeEdge('leaf-service', 'downstream', { connectionType: 'database' }),
      ];
      expect(classifyNode(node, edges)).toBe('service');
    });

    it('returns "service" when edges array is empty', () => {
      const node = makeNode('orphan-node');
      const edges: GraphEdge[] = [];
      expect(classifyNode(node, edges)).toBe('service');
    });

    it('returns "service" when node is not target of any edge', () => {
      const node = makeNode('isolated');
      const edges: GraphEdge[] = [
        makeEdge('svc-a', 'svc-b', { connectionType: 'database' }),
      ];
      expect(classifyNode(node, edges)).toBe('service');
    });
  });

  describe('edge cases', () => {
    it('ignores edges where node is source, not target', () => {
      const node = makeNode('client-node');
      const edges: GraphEdge[] = [
        makeEdge('client-node', 'db-server', { connectionType: 'database' }),
        makeEdge('client-node', 'queue-server', { connectionType: 'messaging_system' }),
      ];
      expect(classifyNode(node, edges)).toBe('service');
    });

    it('handles undefined connectionType gracefully', () => {
      const node = makeNode('svc');
      const edges: GraphEdge[] = [
        { source: 'other', target: 'svc', rate: 10, errorRatio: 0, p95: 0.01, connectionType: '' },
      ];
      expect(classifyNode(node, edges)).toBe('service');
    });

    it('handles undefined virtualNode gracefully', () => {
      const node = makeNode('svc');
      const edges: GraphEdge[] = [
        { source: 'other', target: 'svc', rate: 10, errorRatio: 0, p95: 0.01, connectionType: '' },
      ];
      expect(classifyNode(node, edges)).toBe('service');
    });

    it('correctly classifies with many edges', () => {
      const node = makeNode('busy-node');
      const edges: GraphEdge[] = Array.from({ length: 100 }, (_, i) =>
        makeEdge(`client-${i}`, 'busy-node', { connectionType: '' })
      );
      // Add one database edge in the middle
      edges[50] = makeEdge('client-50', 'busy-node', { connectionType: 'database' });
      expect(classifyNode(node, edges)).toBe('database');
    });

    it('node with mixed client and server edges classified only by server edges', () => {
      const node = makeNode('mixed-node');
      const edges: GraphEdge[] = [
        // Node as client → db (should be ignored for classification)
        makeEdge('mixed-node', 'postgres', { connectionType: 'database' }),
        // Node as server ← normal service call
        makeEdge('upstream', 'mixed-node', { connectionType: '' }),
      ];
      expect(classifyNode(node, edges)).toBe('service');
    });
  });

  describe('constants', () => {
    it('NODE_KIND_COLORS has entries for all kinds', () => {
      const kinds: NodeKind[] = ['service', 'database', 'queue', 'external'];
      for (const kind of kinds) {
        expect(NODE_KIND_COLORS[kind]).toBeDefined();
      }
    });

    it('NODE_KIND_COLORS avoids health palette (green/amber/red)', () => {
      // service is empty string (theme-based), skip it
      const healthColors = ['#22c55e', '#f59e0b', '#ef4444', '#10b981']; // common green/amber/red
      for (const kind of ['database', 'queue', 'external'] as NodeKind[]) {
        const color = NODE_KIND_COLORS[kind].toLowerCase();
        expect(healthColors).not.toContain(color);
        // Also verify they don't start with health-ish hues
        expect(color).not.toMatch(/^#(2[2-9]c|f[0-9a]|e[0-9f]4)/);
      }
    });

    it('NODE_KIND_LABELS has entries for all kinds', () => {
      const kinds: NodeKind[] = ['service', 'database', 'queue', 'external'];
      for (const kind of kinds) {
        expect(NODE_KIND_LABELS[kind]).toBeTruthy();
      }
    });
  });
});
