import type {
  LatLng,
  ResolvedRoute,
  SegmentStatusValue,
  TrailNetwork,
  TrailSegment,
  TrailStatusConfig
} from '../types';
import {
  distanceMeters,
  metersToMiles,
  polylineLengthMeters,
  projectPointToPolyline
} from './geo';
import { generateTurnSteps } from './navigation';

/** Gentle family & senior walking pace: ~2.2 mph = 59 m/min */
export const WALKING_METERS_PER_MIN = 59;

export function getSegmentStatus(
  segmentId: string,
  statusConfig: TrailStatusConfig
): SegmentStatusValue {
  return statusConfig.segments[segmentId]?.status ?? 'open';
}

export function isSegmentOpen(
  segmentId: string,
  statusConfig: TrailStatusConfig
): boolean {
  return getSegmentStatus(segmentId, statusConfig) !== 'closed';
}

function segmentToLatLngs(seg: TrailSegment, reverse = false): LatLng[] {
  const pts = seg.waypoints.map(([lat, lng]) => ({ lat, lng }));
  return reverse ? pts.reverse() : pts;
}

interface DirectedEdge {
  segment: TrailSegment;
  from: string;
  to: string;
  reverse: boolean;
  lengthMeters: number;
}

function buildOpenAdjacency(
  network: TrailNetwork,
  statusConfig: TrailStatusConfig
): Map<string, DirectedEdge[]> {
  const adj = new Map<string, DirectedEdge[]>();
  for (const node of network.nodes) {
    adj.set(node.id, []);
  }
  for (const seg of network.segments) {
    if (!isSegmentOpen(seg.id, statusConfig)) continue;
    const pts = segmentToLatLngs(seg, false);
    const len = polylineLengthMeters(pts);
    adj.get(seg.from)?.push({
      segment: seg,
      from: seg.from,
      to: seg.to,
      reverse: false,
      lengthMeters: len
    });
    adj.get(seg.to)?.push({
      segment: seg,
      from: seg.to,
      to: seg.from,
      reverse: true,
      lengthMeters: len
    });
  }
  return adj;
}

interface ShortestPathResult {
  nodeIds: string[];
  edges: DirectedEdge[];
  distanceMeters: number;
}

/**
 * Closure-aware Dijkstra shortest path over open trail segments.
 * Accepts optional `penalizedSegments` (multiplier) to gently prefer scenic loops
 * instead of retracing the exact same path on return legs.
 */
export function findShortestOpenPath(
  network: TrailNetwork,
  statusConfig: TrailStatusConfig,
  startNodeId: string,
  endNodeId: string,
  penalizedSegments?: Set<string>,
  reusePenalty = 1.65
): ShortestPathResult | null {
  if (startNodeId === endNodeId) {
    return { nodeIds: [startNodeId], edges: [], distanceMeters: 0 };
  }

  const adj = buildOpenAdjacency(network, statusConfig);
  const dist = new Map<string, number>();
  const actualDist = new Map<string, number>();
  const prevEdge = new Map<string, DirectedEdge>();
  const visited = new Set<string>();

  for (const n of network.nodes) {
    dist.set(n.id, Infinity);
    actualDist.set(n.id, Infinity);
  }
  dist.set(startNodeId, 0);
  actualDist.set(startNodeId, 0);

  while (true) {
    let bestNode: string | null = null;
    let bestCost = Infinity;
    for (const [nodeId, cost] of dist.entries()) {
      if (!visited.has(nodeId) && cost < bestCost) {
        bestCost = cost;
        bestNode = nodeId;
      }
    }

    if (!bestNode || bestCost === Infinity) break;
    if (bestNode === endNodeId) break;
    visited.add(bestNode);

    const neighbors = adj.get(bestNode) ?? [];
    for (const edge of neighbors) {
      if (visited.has(edge.to)) continue;
      const mult = penalizedSegments?.has(edge.segment.id) ? reusePenalty : 1;
      const candCost = bestCost + edge.lengthMeters * mult;
      if (candCost < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, candCost);
        actualDist.set(
          edge.to,
          (actualDist.get(bestNode) ?? 0) + edge.lengthMeters
        );
        prevEdge.set(edge.to, edge);
      }
    }
  }

  if (!prevEdge.has(endNodeId)) return null;

  const edges: DirectedEdge[] = [];
  const nodeIds: string[] = [endNodeId];
  let curr = endNodeId;
  while (curr !== startNodeId) {
    const e = prevEdge.get(curr);
    if (!e) return null;
    edges.push(e);
    nodeIds.push(e.from);
    curr = e.from;
  }
  edges.reverse();
  nodeIds.reverse();

  return {
    nodeIds,
    edges,
    distanceMeters: actualDist.get(endNodeId) ?? 0
  };
}

function stitchEdgesToPolyline(edges: DirectedEdge[]): LatLng[] {
  const pts: LatLng[] = [];
  for (const edge of edges) {
    const segPts = segmentToLatLngs(edge.segment, edge.reverse);
    for (let i = 0; i < segPts.length; i++) {
      if (pts.length > 0 && i === 0) continue;
      pts.push(segPts[i]);
    }
  }
  return pts;
}

function findDirectSegment(
  network: TrailNetwork,
  fromNodeId: string,
  toNodeId: string
): { segment: TrailSegment; reverse: boolean } | null {
  for (const seg of network.segments) {
    if (seg.from === fromNodeId && seg.to === toNodeId) {
      return { segment: seg, reverse: false };
    }
    if (seg.to === fromNodeId && seg.from === toNodeId) {
      return { segment: seg, reverse: true };
    }
  }
  return null;
}

/**
 * Resolves a standard blaze loop (0.8 Green, 1.4 Yellow, 2.5 Blue, 3.1 Red).
 * If every canonical segment is open, returns the exact canonical trail.
 * If any segment is marked closed in `trail-status.json`, automatically stitches
 * the shortest open detour around closures while preserving open scenic anchors.
 */
export function resolveStandardLoop(
  network: TrailNetwork,
  statusConfig: TrailStatusConfig,
  loopId: string
): ResolvedRoute | null {
  const loop = network.standardLoops.find((l) => l.id === loopId);
  if (!loop) return null;

  // Check canonical edge-by-edge status
  const canonicalEdges: DirectedEdge[] = [];
  const closedSegmentIds: string[] = [];

  for (let i = 0; i < loop.canonicalNodeIds.length - 1; i++) {
    const a = loop.canonicalNodeIds[i];
    const b = loop.canonicalNodeIds[i + 1];
    const direct = findDirectSegment(network, a, b);
    if (!direct) continue;

    if (!isSegmentOpen(direct.segment.id, statusConfig)) {
      if (!closedSegmentIds.includes(direct.segment.id)) {
        closedSegmentIds.push(direct.segment.id);
      }
    } else {
      const pts = segmentToLatLngs(direct.segment, direct.reverse);
      canonicalEdges.push({
        segment: direct.segment,
        from: a,
        to: b,
        reverse: direct.reverse,
        lengthMeters: polylineLengthMeters(pts)
      });
    }
  }

  let finalEdges: DirectedEdge[] = [];
  let finalNodeIds: string[] = [];
  let isDetoured = false;
  let detourNote: string | undefined;

  if (closedSegmentIds.length === 0) {
    finalEdges = canonicalEdges;
    finalNodeIds = [...loop.canonicalNodeIds];
  } else {
    isDetoured = true;
    // Stitch an open route from parking -> open detour anchors -> parking
    const startNode = loop.canonicalNodeIds[0] ?? 'parking';
    const waypointSequence = [startNode, ...loop.detourAnchors, startNode];
    const usedSegments = new Set<string>();
    const stitchedEdges: DirectedEdge[] = [];
    const stitchedNodes: string[] = [startNode];

    let curr = startNode;
    for (let i = 1; i < waypointSequence.length; i++) {
      const target = waypointSequence[i];
      if (target === curr) continue;
      // Only penalize edge reuse on the final return leg so loop stays natural
      const isReturnLeg = i === waypointSequence.length - 1;
      const leg = findShortestOpenPath(
        network,
        statusConfig,
        curr,
        target,
        isReturnLeg ? usedSegments : undefined,
        1.55
      );
      if (!leg || leg.edges.length === 0) continue;
      for (const e of leg.edges) {
        stitchedEdges.push(e);
        usedSegments.add(e.segment.id);
      }
      for (let k = 1; k < leg.nodeIds.length; k++) {
        stitchedNodes.push(leg.nodeIds[k]);
      }
      curr = target;
    }

    if (stitchedEdges.length === 0) return null;
    finalEdges = stitchedEdges;
    finalNodeIds = stitchedNodes;

    const closedReasons = Array.from(
      new Set(
        closedSegmentIds
          .map((id) => statusConfig.segments[id]?.reason)
          .filter(Boolean)
      )
    );
    detourNote =
      closedReasons.length > 0
        ? `Detour active — avoids closed trail (${closedReasons[0]})`
        : 'Detour active — automatically routed around closed trails';
  }

  const polyline = stitchEdgesToPolyline(finalEdges);
  const distM = polylineLengthMeters(polyline);
  const miles = metersToMiles(distM);

  const route: ResolvedRoute = {
    id: loop.id,
    kind: 'standard',
    title: loop.name,
    subtitle: isDetoured
      ? `Adjusted open detour · ${miles.toFixed(1)} mi`
      : `${loop.canonicalMiles.toFixed(1)} mi · ${loop.summary}`,
    colorHex: loop.colorHex,
    loopColorId: loop.colorId,
    nodeIds: finalNodeIds,
    segmentIds: finalEdges.map((e) => e.segment.id),
    polyline,
    distanceMeters: distM,
    distanceMiles: miles,
    estimatedMinutes: Math.max(5, Math.round(distM / WALKING_METERS_PER_MIN)),
    isDetoured,
    detourNote,
    avoidedClosedSegments: closedSegmentIds,
    steps: []
  };

  route.steps = generateTurnSteps(route, network);
  return route;
}

function permute<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permute(rest)) {
      result.push([items[i], ...tail]);
    }
  }
  return result;
}

/**
 * Builds the shortest open custom walk visiting 1 or more selected POIs
 * and looping safely back to Parking (never entering closed trails).
 */
export function buildCustomWalk(
  network: TrailNetwork,
  statusConfig: TrailStatusConfig,
  selectedPoiIds: string[],
  startNodeId = 'parking',
  endNodeId = 'parking'
): ResolvedRoute | null {
  if (selectedPoiIds.length === 0) return null;

  const selectedPois = selectedPoiIds
    .map((id) => network.pois.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  if (selectedPois.length === 0) return null;

  // Deduplicate destination nodes while tracking unreachable POIs
  const reachableStops: { poiId: string; nodeId: string; name: string }[] = [];
  const unreachablePoiIds: string[] = [];

  for (const poi of selectedPois) {
    const check = findShortestOpenPath(
      network,
      statusConfig,
      startNodeId,
      poi.nodeId
    );
    if (!check) {
      unreachablePoiIds.push(poi.id);
    } else if (!reachableStops.some((s) => s.nodeId === poi.nodeId)) {
      reachableStops.push({
        poiId: poi.id,
        nodeId: poi.nodeId,
        name: poi.shortName
      });
    }
  }

  if (reachableStops.length === 0) return null;

  // Compute pairwise shortest distances for optimal stop ordering
  const keyNodes = Array.from(
    new Set([startNodeId, endNodeId, ...reachableStops.map((s) => s.nodeId)])
  );
  const pairDist = new Map<string, number>();
  for (const a of keyNodes) {
    for (const b of keyNodes) {
      if (a === b) {
        pairDist.set(`${a}->${b}`, 0);
      } else {
        const res = findShortestOpenPath(network, statusConfig, a, b);
        pairDist.set(`${a}->${b}`, res ? res.distanceMeters : Infinity);
      }
    }
  }

  let orderedStops = reachableStops;
  if (reachableStops.length > 1 && reachableStops.length <= 6) {
    let bestOrder = reachableStops;
    let bestTotal = Infinity;
    for (const perm of permute(reachableStops)) {
      let total = pairDist.get(`${startNodeId}->${perm[0].nodeId}`) ?? Infinity;
      for (let i = 0; i < perm.length - 1; i++) {
        total +=
          pairDist.get(`${perm[i].nodeId}->${perm[i + 1].nodeId}`) ?? Infinity;
      }
      total +=
        pairDist.get(`${perm[perm.length - 1].nodeId}->${endNodeId}`) ??
        Infinity;
      if (total < bestTotal) {
        bestTotal = total;
        bestOrder = perm;
      }
    }
    orderedStops = bestOrder;
  } else if (reachableStops.length > 6) {
    // Greedy nearest-neighbor for > 6 stops
    const remaining = [...reachableStops];
    const greedy: typeof reachableStops = [];
    let curr = startNodeId;
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestD = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = pairDist.get(`${curr}->${remaining[i].nodeId}`) ?? Infinity;
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      greedy.push(next);
      curr = next.nodeId;
    }
    orderedStops = greedy;
  }

  // Stitch open legs together, discouraging edge reuse on the return leg to encourage a loop
  const stopNodeChain = [
    startNodeId,
    ...orderedStops.map((s) => s.nodeId),
    endNodeId
  ];
  const usedSegments = new Set<string>();
  const finalEdges: DirectedEdge[] = [];
  const finalNodeIds: string[] = [startNodeId];

  let curr = startNodeId;
  for (let i = 1; i < stopNodeChain.length; i++) {
    const target = stopNodeChain[i];
    if (target === curr) continue;
    const isReturn = i === stopNodeChain.length - 1;
    const leg = findShortestOpenPath(
      network,
      statusConfig,
      curr,
      target,
      isReturn ? usedSegments : undefined,
      1.75
    );
    if (!leg) continue;
    for (const edge of leg.edges) {
      finalEdges.push(edge);
      usedSegments.add(edge.segment.id);
    }
    for (let k = 1; k < leg.nodeIds.length; k++) {
      finalNodeIds.push(leg.nodeIds[k]);
    }
    curr = target;
  }

  if (finalEdges.length === 0) return null;

  const polyline = stitchEdgesToPolyline(finalEdges);
  const distM = polylineLengthMeters(polyline);
  const miles = metersToMiles(distM);

  const stopNames = orderedStops.map((s) => s.name);
  const title =
    stopNames.length === 1
      ? `Walk to ${stopNames[0]}`
      : stopNames.length === 2
        ? `${stopNames[0]} & ${stopNames[1]}`
        : `${stopNames[0]} + ${stopNames.length - 1} more stops`;

  const route: ResolvedRoute = {
    id: `custom-${selectedPoiIds.join('-')}`,
    kind: 'custom',
    title,
    subtitle: `Custom loop · ${stopNames.join(' → ')}`,
    colorHex: '#1B4332',
    nodeIds: finalNodeIds,
    segmentIds: finalEdges.map((e) => e.segment.id),
    polyline,
    distanceMeters: distM,
    distanceMiles: miles,
    estimatedMinutes: Math.max(4, Math.round(distM / WALKING_METERS_PER_MIN)),
    isDetoured: false,
    avoidedClosedSegments: Object.entries(statusConfig.segments)
      .filter(([, entry]) => entry.status === 'closed')
      .map(([id]) => id),
    selectedPoiIds: orderedStops.map((s) => s.poiId),
    unreachablePoiIds,
    steps: []
  };

  route.steps = generateTurnSteps(route, network);
  return route;
}

/**
 * Finds the nearest open trail node to any GPS coordinate.
 */
export function findNearestOpenNode(
  network: TrailNetwork,
  statusConfig: TrailStatusConfig,
  position: LatLng
): { nodeId: string; distanceMeters: number } {
  const openNodeIds = new Set<string>();
  for (const seg of network.segments) {
    if (isSegmentOpen(seg.id, statusConfig)) {
      openNodeIds.add(seg.from);
      openNodeIds.add(seg.to);
    }
  }

  let bestNodeId = 'parking';
  let bestDist = Infinity;

  for (const node of network.nodes) {
    if (!openNodeIds.has(node.id)) continue;
    const d = distanceMeters(position, { lat: node.lat, lng: node.lng });
    if (d < bestDist) {
      bestDist = d;
      bestNodeId = node.id;
    }
  }

  // Also check midpoint projections onto open segments to pick the better endpoint
  for (const seg of network.segments) {
    if (!isSegmentOpen(seg.id, statusConfig)) continue;
    const pts = segmentToLatLngs(seg, false);
    const proj = projectPointToPolyline(position, pts);
    if (proj.distanceMeters < bestDist) {
      const fromNode = network.nodes.find((n) => n.id === seg.from);
      const toNode = network.nodes.find((n) => n.id === seg.to);
      if (fromNode && toNode) {
        const dFrom = distanceMeters(position, fromNode);
        const dTo = distanceMeters(position, toNode);
        bestDist = proj.distanceMeters;
        bestNodeId = dFrom <= dTo ? seg.from : seg.to;
      }
    }
  }

  return { nodeId: bestNodeId, distanceMeters: bestDist };
}

/**
 * One-tap safety route guiding a visitor from their current GPS position straight
 * back to the Parking lot along open trails only.
 */
export function routeBackToParking(
  network: TrailNetwork,
  statusConfig: TrailStatusConfig,
  currentPosition: LatLng
): ResolvedRoute | null {
  const { nodeId: nearestNode } = findNearestOpenNode(
    network,
    statusConfig,
    currentPosition
  );

  const leg = findShortestOpenPath(
    network,
    statusConfig,
    nearestNode,
    'parking'
  );
  if (!leg) return null;

  const polyline =
    leg.edges.length > 0
      ? stitchEdgesToPolyline(leg.edges)
      : [
          currentPosition,
          network.nodes.find((n) => n.id === 'parking') ?? currentPosition
        ];
  const distM = polylineLengthMeters(polyline);
  const miles = metersToMiles(distM);

  const route: ResolvedRoute = {
    id: 'return-to-parking',
    kind: 'return-to-parking',
    title: 'Back to Parking',
    subtitle: 'Shortest open route back to the entrance',
    colorHex: '#0F5E45',
    nodeIds: leg.nodeIds,
    segmentIds: leg.edges.map((e) => e.segment.id),
    polyline,
    distanceMeters: distM,
    distanceMiles: miles,
    estimatedMinutes: Math.max(2, Math.round(distM / WALKING_METERS_PER_MIN)),
    isDetoured: false,
    avoidedClosedSegments: Object.entries(statusConfig.segments)
      .filter(([, entry]) => entry.status === 'closed')
      .map(([id]) => id),
    steps: []
  };

  route.steps = generateTurnSteps(route, network);
  return route;
}
