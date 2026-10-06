/**
 * ServiceMapPanel — SVG-based service map visualization (Milestone 2).
 *
 * Renders nodes (circles) and edges (lines with arrowheads) from the
 * positioned graph model. M2 additions:
 * - Workload-based node keying with unresolved-workload flag
 * - connection_type filter + virtual-node toggles
 * - Blast-radius highlight (BFS upstream/downstream)
 * - Cross-environment/namespace edge highlight
 * - Node drill-downs: traces, Loki logs, service dashboard
 * - Alert overlay badges
 * - DB-edge styling + client-span drill
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { PanelProps } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { ServiceMapOptions, GraphEdge, GraphNode, PositionedNode, PositionedGraph, HealthFilter } from '../types';
import { transformToGraph, filterGraph, filterByHealth, FilterOptions } from '../transform';
import { computeBlastRadius } from '../transform/blastRadius';
import { matchAlerts } from '../transform/alertOverlay';
import { buildTracesDrillUrl, buildDbClientDrillUrl, buildLogsDrillUrl, buildDashboardUrl, buildEdgeTracesDrillUrl } from '../transform/drilldown';
import { layoutGraph } from '../layout';
import { health, flowParams, summarize, nodeHealth, HealthStatus } from '../viz';
import { classifyNode, NodeKind, NODE_KIND_COLORS, NODE_KIND_LABELS } from '../viz/nodeKind';
import { edgePath } from '../geometry';
import { drillTarget } from '../drill/drillTarget';
import { reachableSubgraph } from '../drill/reachableSubgraph';
import { labelYOffset } from './labelUtils';
import {
  ViewState,
  zoomAtPoint,
  panBy,
  fitView,
  computeNodeBounds,
  dragNode,
  isDragMovement,
  nodeRadius,
  ZOOM_FACTOR,
} from '../view';

interface Props extends PanelProps<ServiceMapOptions> {}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeId(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Edge stroke-width: 1px (min) to 5px (max), linearly mapped from RPS. */
export function rateToThickness(rate: number, maxRate: number): number {
  if (maxRate <= 0) { return 1; }
  const ratio = Math.max(0, Math.min(1, rate / maxRate));
  return 1 + ratio * 4;
}

function rateToRadius(totalRate: number, maxTotalRate: number): number {
  return nodeRadius(totalRate, maxTotalRate);
}

function formatRate(rate: number): string {
  if (rate >= 1000) { return `${(rate / 1000).toFixed(1)}k/s`; }
  return `${rate.toFixed(2)}/s`;
}

function formatLatency(seconds: number): string {
  if (seconds >= 1) { return `${seconds.toFixed(2)}s`; }
  return `${(seconds * 1000).toFixed(1)}ms`;
}

function connectionTypeDash(connectionType: string): string {
  switch (connectionType.toLowerCase()) {
    case 'database': return '8 4';
    case 'messaging_system': return '4 4';
    case 'messaging': return '4 4';
    case 'virtual_node': return '2 2';
    default: return 'none';
  }
}

function healthColor(status: HealthStatus, theme: ReturnType<typeof useTheme2>): string {
  switch (status) {
    case 'crit': return theme.colors.error.main;
    case 'warn': return theme.colors.warning.main;
    case 'ok': return theme.colors.success.main;
  }
}

function effectiveDash(connectionType: string, healthStatus: HealthStatus): string {
  const ctDash = connectionTypeDash(connectionType);
  if (ctDash !== 'none') { return ctDash; }
  switch (healthStatus) {
    case 'crit': return '6 3';
    case 'warn': return '10 4';
    case 'ok': return 'none';
  }
}

const PARTICLE_EDGE_SOFT_LIMIT = 60;
const ARROW_SIZE = 8;
const CROSS_BOUNDARY_DASH = '12 4 2 4';
const CROSS_BOUNDARY_COLOR = '#a855f7'; // purple accent for cross-boundary

interface TooltipState { x: number; y: number; content: string[]; }

interface DragState {
  type: 'pan' | 'node';
  nodeId?: string;
  startX: number; startY: number;
  lastX: number; lastY: number;
  totalDx: number; totalDy: number;
}


// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const ServiceMapPanel: React.FC<Props> = ({ options, data, width, height }) => {
  const theme = useTheme2();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [isolatedNodeId, setIsolatedNodeId] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>({ tx: 0, ty: 0, k: 1 });
  const [nodeOverrides, setNodeOverrides] = useState<Map<string, { x: number; y: number }>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const wasDragRef = useRef<boolean>(false);
  const viewRef = useRef<ViewState>(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  /** Timer to distinguish single-click from double-click on nodes. */
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DBLCLICK_DELAY = 250;

  // M2 options with defaults
  const connectionTypeFilter = options.connectionTypeFilter ?? 'all';
  const showVirtualClients = options.showVirtualClients ?? false;
  const showVirtualServers = options.showVirtualServers ?? true;
  const blastRadiusHops = options.blastRadiusHops ?? 1;
  const warnThreshold = options.warnThreshold ?? 0.01;
  const critThreshold = options.errorThreshold ?? 0.05;
  const animate = options.animate ?? true;
  const showEdgeLabels = options.showEdgeLabels ?? false;
  const healthFilter: HealthFilter = options.healthFilter ?? 'all';

  // Transform: raw frames → graph model (workload-keyed)
  const rawGraph = useMemo(() => {
    return transformToGraph(data.series, options.queryMapping);
  }, [data.series, options.queryMapping]);

  // Apply M2 filters (connection_type + virtual-node toggles)
  const filterOpts: FilterOptions = useMemo(() => ({
    connectionTypeFilter,
    showVirtualClients,
    showVirtualServers,
  }), [connectionTypeFilter, showVirtualClients, showVirtualServers]);

  const filteredGraph = useMemo(() => {
    return filterGraph(rawGraph, filterOpts);
  }, [rawGraph, filterOpts]);

  // Compute node health on the connection-type-filtered graph (before health filter)
  const nodeHealthMap = useMemo(
    () => nodeHealth(filteredGraph, warnThreshold, critThreshold),
    [filteredGraph, warnThreshold, critThreshold]
  );

  // Apply health filter (uses health computed from full filtered graph)
  const healthFilteredGraph = useMemo(() => {
    return filterByHealth(filteredGraph, nodeHealthMap, healthFilter);
  }, [filteredGraph, nodeHealthMap, healthFilter]);

  // Layout
  const layoutDirection = options.layoutDirection ?? 'top-down';
  const graph: PositionedGraph = useMemo(() => {
    return layoutGraph(healthFilteredGraph, width, height, layoutDirection);
  }, [healthFilteredGraph, width, height, layoutDirection]);

  // Alert overlay
  const alertMap = useMemo(() => {
    return matchAlerts(data.series, options.alertsRefId, graph.nodes);
  }, [data.series, options.alertsRefId, graph.nodes]);

  // Precompute max values for scaling
  const maxRate = useMemo(
    () => Math.max(...graph.edges.map((e) => e.rate), 0.001),
    [graph.edges]
  );
  const maxTotalRate = useMemo(
    () => Math.max(...graph.nodes.map((n) => n.totalRate), 0.001),
    [graph.nodes]
  );

  // Effective node positions (layout + overrides from dragging)
  const effectiveNodes = useMemo(() => {
    return graph.nodes.map((node) => {
      const override = nodeOverrides.get(node.id);
      if (override) { return { ...node, x: override.x, y: override.y }; }
      return node;
    });
  }, [graph.nodes, nodeOverrides]);

  // Node position lookup
  const nodePos = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    for (const n of effectiveNodes) { map.set(n.id, n); }
    return map;
  }, [effectiveNodes]);

  // Node kind map (service/database/queue/external)
  const nodeKindMap = useMemo(() => {
    const map = new Map<string, NodeKind>();
    for (const node of graph.nodes) {
      map.set(node.id, classifyNode(node, graph.edges));
    }
    return map;
  }, [graph.nodes, graph.edges]);

  // Summary
  const summary = useMemo(
    () => summarize({ nodes: graph.nodes, edges: graph.edges }),
    [graph.nodes, graph.edges]
  );

  // M2: Blast-radius focus (replaces simple neighbor focus)
  const blastRadius = useMemo(() => {
    if (!focusedNodeId) { return null; }
    return computeBlastRadius({ nodes: graph.nodes, edges: graph.edges }, focusedNodeId, blastRadiusHops);
  }, [focusedNodeId, graph.nodes, graph.edges, blastRadiusHops]);

  // Drill isolation: reachable subgraph (client-side multi-hop)
  const isolatedSet = useMemo(() => {
    if (!isolatedNodeId) { return null; }
    return reachableSubgraph({ nodes: graph.nodes, edges: graph.edges }, isolatedNodeId);
  }, [isolatedNodeId, graph.nodes, graph.edges]);

  // Reserve space for summary + legend
  const summaryHeight = 36;
  const svgHeight = height - summaryHeight;

  // Fit-to-view
  const computeFit = useCallback(() => {
    if (effectiveNodes.length === 0) { return { tx: 0, ty: 0, k: 1 }; }
    const bounds = computeNodeBounds(
      effectiveNodes,
      (node) => rateToRadius((node as PositionedNode).totalRate, maxTotalRate)
    );
    // Expand bounds to reserve space for node labels (they extend beyond the
    // circle: left/right in left-right layout, below in top-down). Estimate
    // label width from the longest node id at the current font size.
    const longestLabel = effectiveNodes.reduce((m, n) => Math.max(m, n.id.length), 0);
    const labelWidth = longestLabel * 8.5; // ~8.5px per char at 15px bold
    if (layoutDirection === 'left-right') {
      bounds.minX -= labelWidth; // leftmost column labels extend left
      bounds.maxX += labelWidth; // rightmost column labels extend right
    } else {
      // top-down: labels centered below — pad half-width each side
      bounds.minX -= labelWidth / 2;
      bounds.maxX += labelWidth / 2;
    }
    return fitView(bounds, width, svgHeight, 50);
  }, [effectiveNodes, maxTotalRate, width, svgHeight, layoutDirection]);

  // Auto fit on graph change
  const prevGraphRef = useRef<PositionedGraph | null>(null);
  useEffect(() => {
    if (graph !== prevGraphRef.current) {
      prevGraphRef.current = graph;
      setNodeOverrides(new Map());
      setView(computeFit());
    }
  }, [graph, computeFit]);

  // Zoom handler
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) { return; }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const delta = -e.deltaY * ZOOM_FACTOR * viewRef.current.k;
      setView((prev) => zoomAtPoint(prev, cursor, delta));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => { svg.removeEventListener('wheel', onWheel); };
  }, []);

  const handleFit = useCallback(() => { setView(computeFit()); }, [computeFit]);


  // Mouse down: start pan or node drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) { return; }
      const target = e.target as SVGElement;
      const nodeGroup = target.closest('[data-node-id]') as SVGElement | null;
      if (nodeGroup) {
        const sanitized = nodeGroup.getAttribute('data-node-id')!;
        const node = effectiveNodes.find((n) => sanitizeId(n.id) === sanitized);
        dragRef.current = {
          type: 'node', nodeId: node?.id,
          startX: e.clientX, startY: e.clientY,
          lastX: e.clientX, lastY: e.clientY, totalDx: 0, totalDy: 0,
        };
        // Do NOT preventDefault here — allows native dblclick to fire on nodes
      } else {
        dragRef.current = {
          type: 'pan',
          startX: e.clientX, startY: e.clientY,
          lastX: e.clientX, lastY: e.clientY, totalDx: 0, totalDy: 0,
        };
        e.preventDefault();
      }
    },
    [effectiveNodes]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag) { return; }
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      drag.totalDx += dx; drag.totalDy += dy;
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      if (drag.type === 'pan') {
        setView((prev) => panBy(prev, dx, dy));
      } else if (drag.type === 'node' && drag.nodeId) {
        const node = nodePos.get(drag.nodeId);
        if (node) {
          const newPos = dragNode({ x: node.x, y: node.y }, dx, dy, view.k);
          setNodeOverrides((prev) => { const next = new Map(prev); next.set(drag.nodeId!, newPos); return next; });
        }
      }
    },
    [nodePos, view.k]
  );

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) { return; }
    wasDragRef.current = isDragMovement(drag.totalDx, drag.totalDy);
    dragRef.current = null;
    if (!wasDragRef.current && drag.type === 'pan') {
      setFocusedNodeId(null);
      setIsolatedNodeId(null);
    }
  }, []);

  const handleBackgroundClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      setFocusedNodeId(null);
      setIsolatedNodeId(null);
    }
  }, []);

  // Edge click → trace drill
  const handleEdgeClick = useCallback((edge: GraphEdge) => {
    if (!options.traceDatasourceUid) { return; }
    const url = buildEdgeTracesDrillUrl(edge.source, edge.target, options.traceDatasourceUid);
    if (url) { window.open(url, '_blank', 'noopener,noreferrer'); }
  }, [options.traceDatasourceUid]);

  // Node click: focus (blast radius) or drill — deferred to allow dblclick cancellation
  const handleNodeClick = useCallback((node: PositionedNode, event: React.MouseEvent) => {
    if (wasDragRef.current) { wasDragRef.current = false; return; }
    if (event.ctrlKey || event.metaKey) {
      // Drill-down (immediate, not conflicting with dblclick)
      let url: string | null = null;
      if (node.isDatabase || node.isVirtualServer) {
        url = buildDbClientDrillUrl(node, options.traceDatasourceUid);
      } else {
        url = buildTracesDrillUrl(node, options.traceDatasourceUid);
      }
      if (url) { window.open(url, '_blank', 'noopener,noreferrer'); }
    } else {
      // Defer focus toggle so double-click can cancel it
      if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); }
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        setFocusedNodeId((prev) => (prev === node.id ? null : node.id));
      }, DBLCLICK_DELAY);
    }
  }, [options.traceDatasourceUid]);

  // Double-click: isolate reachable dependency subgraph (client-side)
  const handleNodeDoubleClick = useCallback((node: PositionedNode, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // Cancel pending single-click focus toggle
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setIsolatedNodeId((prev) => (prev === node.id ? null : node.id));
    setFocusedNodeId(null);
  }, []);

  // Context menu actions for node drill-downs
  const handleNodeLogsClick = useCallback((node: GraphNode) => {
    if (!options.logsDatasourceUid) { return; }
    const url = buildLogsDrillUrl(node, options.logsDatasourceUid);
    if (url) { window.open(url, '_blank', 'noopener,noreferrer'); }
  }, [options.logsDatasourceUid]);

  const handleNodeDashboardClick = useCallback((node: GraphNode) => {
    if (!options.dashboardUrlTemplate) { return; }
    const url = buildDashboardUrl(node, options.dashboardUrlTemplate);
    if (url) { window.open(url, '_blank', 'noopener,noreferrer'); }
  }, [options.dashboardUrlTemplate]);

  // Tooltip positioning
  const tooltipPos = useCallback((event: React.MouseEvent): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const TW = 260; const TH = 180;
      let x = event.clientX - rect.left;
      let y = event.clientY - rect.top;
      if (x + TW > rect.width) { x = Math.max(0, rect.width - TW); }
      if (y + TH > rect.height) { y = Math.max(0, rect.height - TH); }
      return { x, y };
    }
    return { x: event.clientX, y: event.clientY };
  }, []);

  const handleEdgeHover = useCallback((edge: GraphEdge, event: React.MouseEvent) => {
    const edgeHealth = health(edge.errorRatio, warnThreshold, critThreshold);
    const pos = tooltipPos(event);
    const content = [
      `${edge.source} → ${edge.target}`,
      `Rate: ${formatRate(edge.rate)}`,
      `Error: ${(edge.errorRatio * 100).toFixed(1)}%`,
      `p95: ${formatLatency(edge.p95)}`,
      `Health: ${edgeHealth}`,
      edge.connectionType ? `Type: ${edge.connectionType}` : '',
      edge.crossEnvironment ? '⚡ Cross-environment' : '',
      edge.crossNamespace ? '🔀 Cross-namespace' : '',
    ].filter(Boolean);
    setTooltip({ x: pos.x, y: pos.y, content });
  }, [warnThreshold, critThreshold, tooltipPos]);

  const handleNodeHover = useCallback((node: PositionedNode, event: React.MouseEvent) => {
    const status = nodeHealthMap.get(node.id) ?? 'ok';
    const alerts = alertMap.get(node.id);
    const pos = tooltipPos(event);
    const isDrillable = drillTarget(node, graph.edges) !== null;
    const content = [
      node.id,
      node.environment ? `Env: ${node.environment}` : '',
      node.namespace ? `NS: ${node.namespace}` : '',
      node.workload ? `Workload: ${node.workload}` : '',
      node.eksCluster ? `Cluster: ${node.eksCluster}` : '',
      node.serviceName && node.serviceName !== node.id ? `Service: ${node.serviceName}` : '',
      `In: ${formatRate(node.inRate)}`,
      `Out: ${formatRate(node.outRate)}`,
      `Total: ${formatRate(node.totalRate)}`,
      `Health: ${status}`,
      alerts ? `🔔 ${alerts.length} alert(s)` : '',
      isDrillable ? '↢ Drill in' : '',
      '',
      'Click: focus · Dbl-click: drill · Ctrl+Click: traces',
      options.logsDatasourceUid ? 'Shift+Click: logs' : '',
    ].filter(Boolean);
    setTooltip({ x: pos.x, y: pos.y, content });
  }, [nodeHealthMap, alertMap, tooltipPos, options.logsDatasourceUid, graph.edges]);

  const handleMouseLeave = useCallback(() => { setTooltip(null); }, []);

  const particleReduction = graph.edges.length > PARTICLE_EDGE_SOFT_LIMIT
    ? Math.max(1, Math.round(graph.edges.length / PARTICLE_EDGE_SOFT_LIMIT)) : 1;


  // Empty state
  if (graph.nodes.length === 0) {
    const hasRawData = rawGraph.nodes.length > 0;
    const message = hasRawData
      ? 'No nodes match the current filter. Try changing the Health filter or Connection type filter.'
      : 'No service graph data. Configure rate/error/latency queries with client/server or client_k8s_deployment_name/server_k8s_deployment_name columns.';
    return (
      <div className={css`display:flex;align-items:center;justify-content:center;width:${width}px;height:${height}px;color:${theme.colors.text.secondary};`}>
        {message}
      </div>
    );
  }

  // Panning updates `view` state on every mouse move, so this render-time ref read
  // reflects the current drag state; a ref avoids an extra state + re-render per drag frame.
  // eslint-disable-next-line react-hooks/refs -- intentional, see note above
  const svgCursor = dragRef.current ? 'grabbing' : 'grab';

  return (
    <div ref={containerRef} className={css`position:relative;width:${width}px;height:${height}px;overflow:hidden;`}>
      <svg
        ref={svgRef} width={width} height={svgHeight}
        viewBox={`${-view.tx / view.k} ${-view.ty / view.k} ${width / view.k} ${svgHeight / view.k}`}
        xmlns="http://www.w3.org/2000/svg" overflow="hidden"
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onClick={handleBackgroundClick}
        onMouseLeave={(e) => { handleMouseLeave(); dragRef.current = null; }}
        style={{ cursor: svgCursor }}
      >
        <defs>
          <marker id="arrow-ok" markerWidth={String(ARROW_SIZE)} markerHeight={String(ARROW_SIZE*0.6)} refX={String(ARROW_SIZE)} refY={String(ARROW_SIZE*0.3)} orient="auto" markerUnits="userSpaceOnUse">
            <polygon points={`0 0,${ARROW_SIZE} ${ARROW_SIZE*0.3},0 ${ARROW_SIZE*0.6}`} fill={healthColor('ok',theme)} style={{pointerEvents:'none'}}/>
          </marker>
          <marker id="arrow-warn" markerWidth={String(ARROW_SIZE)} markerHeight={String(ARROW_SIZE*0.6)} refX={String(ARROW_SIZE)} refY={String(ARROW_SIZE*0.3)} orient="auto" markerUnits="userSpaceOnUse">
            <polygon points={`0 0,${ARROW_SIZE} ${ARROW_SIZE*0.3},0 ${ARROW_SIZE*0.6}`} fill={healthColor('warn',theme)} style={{pointerEvents:'none'}}/>
          </marker>
          <marker id="arrow-crit" markerWidth={String(ARROW_SIZE)} markerHeight={String(ARROW_SIZE*0.6)} refX={String(ARROW_SIZE)} refY={String(ARROW_SIZE*0.3)} orient="auto" markerUnits="userSpaceOnUse">
            <polygon points={`0 0,${ARROW_SIZE} ${ARROW_SIZE*0.3},0 ${ARROW_SIZE*0.6}`} fill={healthColor('crit',theme)} style={{pointerEvents:'none'}}/>
          </marker>
        </defs>

        {/* Edges */}
        {graph.edges.map((edge, edgeIndex) => {
          const src = nodePos.get(edge.source);
          const tgt = nodePos.get(edge.target);
          if (!src || !tgt) { return null; }
          const edgeStatus = health(edge.errorRatio, warnThreshold, critThreshold);
          const color = (edge.crossEnvironment || edge.crossNamespace)
            ? CROSS_BOUNDARY_COLOR : healthColor(edgeStatus, theme);
          const thickness = rateToThickness(edge.rate, maxRate);
          const dash = (edge.crossEnvironment || edge.crossNamespace)
            ? CROSS_BOUNDARY_DASH : effectiveDash(edge.connectionType, edgeStatus);
          const srcRadius = rateToRadius(src.totalRate, maxTotalRate);
          const tgtRadius = rateToRadius(tgt.totalRate, maxTotalRate);
          const dx = tgt.x - src.x; const dy = tgt.y - src.y;
          const dist = Math.sqrt(dx*dx + dy*dy) || 1;
          const ux = dx/dist; const uy = dy/dist;
          const x1 = src.x + ux*srcRadius; const y1 = src.y + uy*srcRadius;
          const x2 = tgt.x - ux*(tgtRadius+ARROW_SIZE); const y2 = tgt.y - uy*(tgtRadius+ARROW_SIZE);
          const key = `${edge.source}-${edge.target}-${edgeIndex}`;
          const pathId = `path-${sanitizeId(edge.source)}-${sanitizeId(edge.target)}-${edgeIndex}`;
          // Blast-radius focus + drill isolation
          const edgeKey = `${edge.source}\x00${edge.target}`;
          const isIsolationVisible = isolatedSet
            ? isolatedSet.has(edge.source) && isolatedSet.has(edge.target)
            : true;
          const isBlastVisible = blastRadius ? blastRadius.highlightedEdges.has(edgeKey) : true;
          const isFocused = isIsolationVisible && isBlastVisible;
          const opacity = isFocused ? 1 : (isolatedSet ? 0.08 : 0.15);
          const fp = flowParams(edge.rate, maxRate);
          const particleCount = Math.max(1, Math.round(fp.count / particleReduction));
          const midX = (x1+x2)/2; const midY = (y1+y2)/2;
          const motionPath = edgePath(x1, y1, x2, y2);
          return (
            <React.Fragment key={key}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={thickness}
                strokeDasharray={dash} markerEnd={`url(#arrow-${edgeStatus})`} opacity={opacity}
                style={{cursor:'pointer'}}
                onMouseMove={(e)=>{e.stopPropagation();handleEdgeHover(edge,e);}}
                onMouseLeave={handleMouseLeave}
                onClick={(e)=>{e.stopPropagation();handleEdgeClick(edge);}}/>
              {edgeStatus !== 'ok' && (
                <text x={midX} y={midY-thickness-2} textAnchor="middle" fill={color} fontSize={10}
                  fontFamily="sans-serif" opacity={opacity} style={{pointerEvents:'none'}}
                  aria-label={edgeStatus==='crit'?'critical':'warning'}>
                  {edgeStatus==='crit'?'✖':'⚠'}
                </text>
              )}
              {animate && isFocused && Array.from({length:particleCount}).map((_,i) => (
                <circle key={`particle-${pathId}-${i}`} r={3.5}
                  fill="#fff" stroke={color} strokeWidth={1.2} opacity={0.95}
                  data-particle="true" style={{pointerEvents:'none'}}>
                  <animateMotion dur={`${fp.speed}s`} repeatCount="indefinite"
                    begin={`${(i/particleCount)*fp.speed}s`} path={motionPath}/>
                </circle>
              ))}
              {showEdgeLabels && isFocused && (
                <text x={midX} y={midY+thickness+12} textAnchor="middle"
                  fill={theme.colors.text.secondary} fontSize={9} fontFamily="sans-serif"
                  opacity={opacity} style={{pointerEvents:'none'}}>
                  {formatRate(edge.rate)} · {(edge.errorRatio*100).toFixed(1)}% · {formatLatency(edge.p95)}
                </text>
              )}
            </React.Fragment>
          );
        })}


        {/* Nodes */}
        {effectiveNodes.map((node) => {
          const radius = rateToRadius(node.totalRate, maxTotalRate);
          const status = nodeHealthMap.get(node.id) ?? 'ok';
          const ringColor = healthColor(status, theme);
          const isFocused = (isolatedSet ? isolatedSet.has(node.id) : true)
            && (blastRadius ? blastRadius.highlighted.has(node.id) : true);
          const opacity = isFocused ? 1 : (isolatedSet ? 0.08 : 0.15);
          const alerts = alertMap.get(node.id);
          const kind = nodeKindMap.get(node.id) ?? 'service';
          const kindFill = kind === 'service'
            ? theme.colors.background.secondary
            : NODE_KIND_COLORS[kind];
          return (
            <g key={node.id} data-node-id={sanitizeId(node.id)}
              onMouseMove={(e)=>{e.stopPropagation();handleNodeHover(node,e);}}
              onMouseLeave={handleMouseLeave}
              onDoubleClick={(e)=>{handleNodeDoubleClick(node,e);}}
              onClick={(e)=>{
                e.stopPropagation();
                if (e.shiftKey && options.logsDatasourceUid) { handleNodeLogsClick(node); return; }
                if (e.altKey && options.dashboardUrlTemplate) { handleNodeDashboardClick(node); return; }
                handleNodeClick(node,e);
              }}
              style={{cursor:'pointer'}} opacity={opacity}>
              {/* Node body — fill = kind, ring = health */}
              <circle cx={node.x} cy={node.y} r={radius}
                fill={kindFill}
                stroke={ringColor} strokeWidth={3}
                data-kind={kind}/>
              {/* Kind glyph (lightweight, color is primary signal) */}
              {kind === 'database' && (
                <text x={node.x} y={node.y+4} textAnchor="middle" fontSize={radius*0.8}
                  fill="#fff" style={{pointerEvents:'none'}}>⛁</text>
              )}
              {kind === 'queue' && (
                <text x={node.x} y={node.y+4} textAnchor="middle" fontSize={radius*0.7}
                  fill="#fff" style={{pointerEvents:'none'}}>≡</text>
              )}
              {kind === 'external' && (
                <text x={node.x} y={node.y+4} textAnchor="middle" fontSize={radius*0.7}
                  fill="#fff" style={{pointerEvents:'none'}}>☁</text>
              )}
              {/* Alert badge */}
              {alerts && alerts.length > 0 && (
                <g>
                  <circle cx={node.x+radius*0.7} cy={node.y-radius*0.7} r={8}
                    fill={theme.colors.error.main}/>
                  <text x={node.x+radius*0.7} y={node.y-radius*0.7+4} textAnchor="middle"
                    fill="#fff" fontSize={9} fontFamily="sans-serif" style={{pointerEvents:'none'}}>
                    {alerts.length > 9 ? '9+' : alerts.length}
                  </text>
                </g>
              )}
              {/* Node label — position depends on layout direction and column */}
              {(() => {
                if (layoutDirection === 'left-right') {
                  const layer = node.layer ?? 0;
                  const total = node.totalLayers ?? 1;
                  const isLeftmost = layer === 0;
                  const isRightmost = layer === total - 1;
                  // Wrapped grid blocks → label to the RIGHT of each node
                  // (sub-columns are spaced to fit label width).
                  if (node.wrapped) {
                    return (
                      <text x={node.x + radius + 6} y={node.y + 4} textAnchor="start"
                        fill={theme.colors.text.primary} fontSize={15} fontFamily="sans-serif" fontWeight={700}
                        style={{pointerEvents:'none'}}>
                        {node.id}
                      </text>
                    );
                  }
                  if (isLeftmost && total > 1) {
                    // Leftmost column (sources) → label to the LEFT
                    return (
                      <text x={node.x - radius - 6} y={node.y + 4} textAnchor="end"
                        fill={theme.colors.text.primary} fontSize={15} fontFamily="sans-serif" fontWeight={700}
                        style={{pointerEvents:'none'}}>
                        {node.id}
                      </text>
                    );
                  }
                  if (isRightmost) {
                    // Rightmost column (sinks) → label to the RIGHT
                    return (
                      <text x={node.x + radius + 6} y={node.y + 4} textAnchor="start"
                        fill={theme.colors.text.primary} fontSize={15} fontFamily="sans-serif" fontWeight={700}
                        style={{pointerEvents:'none'}}>
                        {node.id}
                      </text>
                    );
                  }
                  // Middle columns → label BELOW
                  return (
                    <text x={node.x} y={node.y + radius + 14} textAnchor="middle"
                      fill={theme.colors.text.primary} fontSize={15} fontFamily="sans-serif" fontWeight={700}
                      style={{pointerEvents:'none'}}>
                      {node.id}
                    </text>
                  );
                }
                // top-down → label below with stagger
                return (
                  <text x={node.x} y={node.y+radius+labelYOffset(node.layerIndex ?? 0)} textAnchor="middle"
                    fill={theme.colors.text.primary} fontSize={15} fontFamily="sans-serif" fontWeight={700}
                    style={{pointerEvents:'none'}}>
                    {node.id}
                  </text>
                );
              })()}
            </g>
          );
        })}
      </svg>

      {/* Isolation indicator (replaces breadcrumb for drill) */}
      {isolatedNodeId && (
        <div
          data-testid="isolation-indicator"
          className={css`
            position: absolute;
            top: 8px;
            left: 8px;
            z-index: 5;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-family: sans-serif;
            padding: 4px 10px;
            border-radius: 4px;
            background: ${theme.colors.background.primary};
            border: 1px solid ${theme.colors.border.weak};
            color: ${theme.colors.text.secondary};
          `}
        >
          <span>Isolated: <strong>{isolatedNodeId}</strong></span>
          <button
            data-testid="isolation-reset"
            onClick={() => setIsolatedNodeId(null)}
            className={css`
              background: none;
              border: 1px solid ${theme.colors.border.weak};
              border-radius: 3px;
              padding: 1px 6px;
              cursor: pointer;
              font-size: 10px;
              color: ${theme.colors.text.link};
              &:hover { background: ${theme.colors.background.secondary}; }
            `}
          >
            reset
          </button>
        </div>
      )}

      {/* Zoom controls */}
      <div className={css`position:absolute;bottom:${summaryHeight+12}px;right:8px;display:flex;flex-direction:column;gap:4px;z-index:1;`}>
        <button onClick={() => {
          const cx = width / 2; const cy = svgHeight / 2;
          setView((prev) => zoomAtPoint(prev, { x: cx, y: cy }, prev.k * 0.3));
        }} title="Zoom in" aria-label="Zoom in"
          className={css`width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:4px;border:1px solid ${theme.colors.border.weak};background:${theme.colors.background.primary};color:${theme.colors.text.secondary};cursor:pointer;font-size:16px;font-weight:bold;&:hover{background:${theme.colors.background.secondary};color:${theme.colors.text.primary};}`}>
          +
        </button>
        <button onClick={() => {
          const cx = width / 2; const cy = svgHeight / 2;
          setView((prev) => zoomAtPoint(prev, { x: cx, y: cy }, -prev.k * 0.3));
        }} title="Zoom out" aria-label="Zoom out"
          className={css`width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:4px;border:1px solid ${theme.colors.border.weak};background:${theme.colors.background.primary};color:${theme.colors.text.secondary};cursor:pointer;font-size:16px;font-weight:bold;&:hover{background:${theme.colors.background.secondary};color:${theme.colors.text.primary};}`}>
          −
        </button>
        <button onClick={handleFit} title="Fit to view" aria-label="Fit to view"
          className={css`width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:4px;border:1px solid ${theme.colors.border.weak};background:${theme.colors.background.primary};color:${theme.colors.text.secondary};cursor:pointer;font-size:14px;&:hover{background:${theme.colors.background.secondary};color:${theme.colors.text.primary};}`}>
          ⊞
        </button>
      </div>

      {/* Summary + legend */}
      <div className={css`display:flex;align-items:center;justify-content:space-between;height:${summaryHeight}px;padding:0 12px;font-size:11px;color:${theme.colors.text.secondary};border-top:1px solid ${theme.colors.border.weak};background:${theme.colors.background.primary};`}>
        <span>
          {summary.services} services · {summary.edges} edges · {summary.errorPct.toFixed(1)}% errors · {formatRate(summary.totalRps)} total
        </span>
        <span className={css`display:flex;align-items:center;gap:10px;`}>
          <LegendItem color={healthColor('ok',theme)} label="OK"/>
          <LegendItem color={healthColor('warn',theme)} label="Warn" dashed/>
          <LegendItem color={healthColor('crit',theme)} label="Crit" dashed/>
          <LegendItem color={CROSS_BOUNDARY_COLOR} label="Cross-boundary" dashed/>
          <KindLegendItem color={theme.colors.background.secondary} label={NODE_KIND_LABELS.service}/>
          <KindLegendItem color={NODE_KIND_COLORS.database} label={NODE_KIND_LABELS.database}/>
          <KindLegendItem color={NODE_KIND_COLORS.queue} label={NODE_KIND_LABELS.queue}/>
          <KindLegendItem color={NODE_KIND_COLORS.external} label={NODE_KIND_LABELS.external}/>
          {animate && (
            <span className={css`display:flex;align-items:center;gap:3px;`}>
              <svg width="16" height="10" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="2" width="5" height="5" rx="2.5" ry="2.5" fill={theme.colors.text.secondary} opacity={0.8}/>
                <rect x="9" y="3" width="4" height="4" rx="2" ry="2" fill={theme.colors.text.secondary} opacity={0.5}/>
              </svg>
              <span>= requests</span>
            </span>
          )}
        </span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className={css`position:absolute;left:${tooltip.x+12}px;top:${tooltip.y+12}px;background:${theme.colors.background.primary};border:1px solid ${theme.colors.border.weak};border-radius:4px;padding:8px 12px;font-size:12px;line-height:1.5;pointer-events:none;z-index:10000;box-shadow:0 2px 8px rgba(0,0,0,0.15);color:${theme.colors.text.primary};white-space:nowrap;`}>
          {tooltip.content.map((line,i) => (<div key={i}>{line}</div>))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Legend item
// ─────────────────────────────────────────────────────────────────────────────
interface LegendItemProps { color: string; label: string; dashed?: boolean; }
const LegendItem: React.FC<LegendItemProps> = ({ color, label, dashed }) => (
  <span className={css`display:flex;align-items:center;gap:4px;`}>
    <svg width="16" height="4" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth={2}
        strokeDasharray={dashed?'4 2':'none'}/>
    </svg>
    <span>{label}</span>
  </span>
);

// Kind legend — uses a filled circle to match node fill visual
interface KindLegendItemProps { color: string; label: string; }
const KindLegendItem: React.FC<KindLegendItemProps> = ({ color, label }) => (
  <span className={css`display:flex;align-items:center;gap:4px;`} data-testid={`kind-legend-${label}`}>
    <svg width="12" height="12" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6" r="5" fill={color} stroke="#888" strokeWidth={0.5}/>
    </svg>
    <span>{label}</span>
  </span>
);
