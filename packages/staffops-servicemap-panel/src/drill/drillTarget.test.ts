/**
 * Tests for drillTarget — pure function that determines re-root eligibility.
 *
 * Coverage targets:
 * - Service nodes WITH env + namespace → drillable
 * - Service nodes MISSING env → null
 * - Service nodes MISSING namespace → null
 * - Service nodes MISSING both → null
 * - Database nodes (even with env + ns) → null
 * - Queue nodes (even with env + ns) → null
 * - External nodes (even with env + ns) → null
 * - Edge cases: empty string env/namespace
 */

import { drillTarget } from './drillTarget';
import { GraphNode, GraphEdge } from '../types';

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'my-service',
    inRate: 100,
    outRate: 50,
    totalRate: 150,
    environment: 'production',
    namespace: 'payments',
    ...overrides,
  };
}

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    source: 'caller',
    target: 'my-service',
    rate: 100,
    errorRatio: 0.01,
    p95: 0.1,
    connectionType: '',
    ...overrides,
  };
}

describe('drillTarget', () => {
  describe('service nodes', () => {
    it('returns drill vars for a service node with env and namespace', () => {
      const node = makeNode({ id: 'orders-api', environment: 'prd', namespace: 'orders' });
      const edges = [makeEdge({ target: 'orders-api', connectionType: '' })];

      const result = drillTarget(node, edges);

      expect(result).toEqual({
        environment: 'prd',
        namespace: 'orders',
        service: 'orders-api',
      });
    });

    it('returns null when environment is missing (undefined)', () => {
      const node = makeNode({ id: 'svc-a', environment: undefined, namespace: 'ns1' });
      const edges = [makeEdge({ target: 'svc-a' })];

      expect(drillTarget(node, edges)).toBeNull();
    });

    it('returns null when environment is empty string', () => {
      const node = makeNode({ id: 'svc-b', environment: '', namespace: 'ns1' });
      const edges = [makeEdge({ target: 'svc-b' })];

      expect(drillTarget(node, edges)).toBeNull();
    });

    it('returns null when namespace is missing (undefined)', () => {
      const node = makeNode({ id: 'svc-c', environment: 'dev', namespace: undefined });
      const edges = [makeEdge({ target: 'svc-c' })];

      expect(drillTarget(node, edges)).toBeNull();
    });

    it('returns null when namespace is empty string', () => {
      const node = makeNode({ id: 'svc-d', environment: 'dev', namespace: '' });
      const edges = [makeEdge({ target: 'svc-d' })];

      expect(drillTarget(node, edges)).toBeNull();
    });

    it('returns null when both env and namespace are missing', () => {
      const node = makeNode({ id: 'svc-e', environment: undefined, namespace: undefined });
      const edges = [makeEdge({ target: 'svc-e' })];

      expect(drillTarget(node, edges)).toBeNull();
    });

    it('works for a service node with no incoming edges (pure client)', () => {
      const node = makeNode({ id: 'gateway', environment: 'prd', namespace: 'infra' });
      // No edges targeting this node → classifyNode returns 'service'
      const edges = [makeEdge({ source: 'gateway', target: 'other-svc' })];

      const result = drillTarget(node, edges);
      expect(result).toEqual({
        environment: 'prd',
        namespace: 'infra',
        service: 'gateway',
      });
    });
  });

  describe('database nodes', () => {
    it('returns null even with env and namespace present', () => {
      const node = makeNode({
        id: 'postgres-main',
        environment: 'prd',
        namespace: 'databases',
        isDatabase: true,
      });
      const edges = [makeEdge({ target: 'postgres-main', connectionType: 'database' })];

      expect(drillTarget(node, edges)).toBeNull();
    });
  });

  describe('queue nodes', () => {
    it('returns null even with env and namespace present', () => {
      const node = makeNode({
        id: 'sqs-orders',
        environment: 'prd',
        namespace: 'messaging',
      });
      const edges = [makeEdge({ target: 'sqs-orders', connectionType: 'messaging_system' })];

      expect(drillTarget(node, edges)).toBeNull();
    });
  });

  describe('external nodes', () => {
    it('returns null for virtual_node=server even with env and namespace', () => {
      const node = makeNode({
        id: 'stripe-api',
        environment: 'prd',
        namespace: 'external',
        isVirtualServer: true,
      });
      const edges = [makeEdge({ target: 'stripe-api', virtualNode: 'server' })];

      expect(drillTarget(node, edges)).toBeNull();
    });

    it('returns null for connection_type=virtual_node', () => {
      const node = makeNode({
        id: 'external-dep',
        environment: 'prd',
        namespace: 'ext',
      });
      const edges = [makeEdge({ target: 'external-dep', connectionType: 'virtual_node' })];

      expect(drillTarget(node, edges)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles empty edges array (node classified as service)', () => {
      const node = makeNode({ id: 'orphan', environment: 'dev', namespace: 'test' });
      const result = drillTarget(node, []);
      expect(result).toEqual({ environment: 'dev', namespace: 'test', service: 'orphan' });
    });

    it('uses node.id as the service value', () => {
      const node = makeNode({ id: 'my-fancy-deployment', environment: 'hml', namespace: 'staging' });
      const result = drillTarget(node, []);
      expect(result).not.toBeNull();
      expect(result!.service).toBe('my-fancy-deployment');
    });
  });
});
