import type {
  LatLng,
  NavigationState,
  ResolvedRoute,
  TrailNetwork,
  TurnStep,
  TurnType
} from '../types';
import {
  angleDelta,
  bearingDeg,
  distanceMeters,
  formatDistanceShort,
  polylineLengthMeters,
  projectPointToPolyline
} from './geo';
import { WALKING_METERS_PER_MIN } from './router';

export const OFF_TRACK_ENTER_METERS = 22;
export const OFF_TRACK_EXIT_METERS = 14;
export const ARRIVAL_RADIUS_METERS = 18;

function classifyTurn(deltaDeg: number): TurnType {
  const abs = Math.abs(deltaDeg);
  if (abs < 24) return 'straight';
  if (abs > 152) return 'u-turn';
  if (deltaDeg < 0) {
    if (abs < 55) return 'slight-left';
    if (abs < 122) return 'left';
    return 'sharp-left';
  } else {
    if (abs < 55) return 'slight-right';
    if (abs < 122) return 'right';
    return 'sharp-right';
  }
}

function turnVerb(turnType: TurnType): string {
  switch (turnType) {
    case 'start':
      return 'Head out on the trail';
    case 'straight':
      return 'Keep straight';
    case 'slight-left':
      return 'Bear left';
    case 'left':
      return 'Turn left';
    case 'sharp-left':
      return 'Sharp left';
    case 'slight-right':
      return 'Bear right';
    case 'right':
      return 'Turn right';
    case 'sharp-right':
      return 'Sharp right';
    case 'u-turn':
      return 'Turn around';
    case 'arrive':
      return 'Arrive back at Parking';
  }
}

function cardinalDirection(deg: number): string {
  const dirs = [
    'north',
    'northeast',
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest'
  ];
  return dirs[Math.round(deg / 45) % 8];
}

function findNodeLandmark(nodeId: string, network: TrailNetwork): string | undefined {
  const poi = network.pois.find((p) => p.nodeId === nodeId);
  if (poi) return poi.shortName;
  const node = network.nodes.find((n) => n.id === nodeId);
  return node?.label;
}

function findSegmentPoints(
  network: TrailNetwork,
  fromId: string,
  toId: string
): LatLng[] {
  for (const seg of network.segments) {
    if (seg.from === fromId && seg.to === toId) {
      return seg.waypoints.map(([lat, lng]) => ({ lat, lng }));
    }
    if (seg.to === fromId && seg.from === toId) {
      return [...seg.waypoints].reverse().map(([lat, lng]) => ({ lat, lng }));
    }
  }
  const a = network.nodes.find((n) => n.id === fromId);
  const b = network.nodes.find((n) => n.id === toId);
  if (a && b) return [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }];
  return [];
}

/**
 * Compute tangent bearing entering or leaving a polyline end, looking at least
 * ~15m along the segment so micro-bends at junctions don't distort turn angles.
 */
function sampleTangentBearing(pts: LatLng[], atEnd: 'start' | 'end'): number {
  if (pts.length < 2) return 0;
  if (atEnd === 'start') {
    const origin = pts[0];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += distanceMeters(pts[i - 1], pts[i]);
      if (acc >= 15 || i === pts.length - 1) {
        return bearingDeg(origin, pts[i]);
      }
    }
    return bearingDeg(pts[0], pts[1]);
  } else {
    const dest = pts[pts.length - 1];
    let acc = 0;
    for (let i = pts.length - 2; i >= 0; i--) {
      acc += distanceMeters(pts[i], pts[i + 1]);
      if (acc >= 15 || i === 0) {
        return bearingDeg(pts[i], dest);
      }
    }
    return bearingDeg(pts[pts.length - 2], dest);
  }
}

/**
 * Generates clean, human-friendly turn-by-turn navigation steps for a resolved route.
 */
export function generateTurnSteps(
  route: ResolvedRoute,
  network: TrailNetwork
): TurnStep[] {
  const { nodeIds } = route;
  if (nodeIds.length < 2) return [];

  const steps: TurnStep[] = [];
  const legPolylines: LatLng[][] = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    legPolylines.push(findSegmentPoints(network, nodeIds[i], nodeIds[i + 1]));
  }

  const startCoord = legPolylines[0]?.[0] ?? route.polyline[0];
  const initialBearing = sampleTangentBearing(legPolylines[0], 'start');
  const firstLandmark = findNodeLandmark(nodeIds[1], network);

  steps.push({
    index: 0,
    nodeId: nodeIds[0],
    coordinate: startCoord,
    distanceFromStartMeters: 0,
    turnType: 'start',
    instruction: firstLandmark
      ? `Head ${cardinalDirection(initialBearing)} toward ${firstLandmark}`
      : `Head ${cardinalDirection(initialBearing)} on the trail`,
    landmarkName: findNodeLandmark(nodeIds[0], network),
    outgoingBearingDeg: initialBearing
  });

  let cumulative = polylineLengthMeters(legPolylines[0]);

  for (let i = 1; i < nodeIds.length - 1; i++) {
    const incomingLeg = legPolylines[i - 1];
    const outgoingLeg = legPolylines[i];
    const inBearing = sampleTangentBearing(incomingLeg, 'end');
    const outBearing = sampleTangentBearing(outgoingLeg, 'start');
    const delta = angleDelta(inBearing, outBearing);
    const turnType = classifyTurn(delta);
    const node = network.nodes.find((n) => n.id === nodeIds[i]);
    const landmark = findNodeLandmark(nodeIds[i], network);
    const nextLandmark = findNodeLandmark(nodeIds[i + 1], network);

    // Emit step if it's a meaningful turn OR a named junction/landmark
    if (turnType !== 'straight' || Boolean(landmark)) {
      let instruction = turnVerb(turnType);
      if (landmark && turnType !== 'straight') {
        instruction = `${turnVerb(turnType)} at ${landmark}`;
      } else if (landmark && turnType === 'straight') {
        instruction = `Keep straight past ${landmark}`;
      } else if (nextLandmark && turnType !== 'straight') {
        instruction = `${turnVerb(turnType)} toward ${nextLandmark}`;
      }

      steps.push({
        index: steps.length,
        nodeId: nodeIds[i],
        coordinate: node
          ? { lat: node.lat, lng: node.lng }
          : outgoingLeg[0],
        distanceFromStartMeters: cumulative,
        turnType,
        instruction,
        landmarkName: landmark,
        outgoingBearingDeg: outBearing
      });
    }

    cumulative += polylineLengthMeters(outgoingLeg);
  }

  const endNodeId = nodeIds[nodeIds.length - 1];
  const endCoord = route.polyline[route.polyline.length - 1];
  const endLandmark = findNodeLandmark(endNodeId, network) ?? 'Parking';

  steps.push({
    index: steps.length,
    nodeId: endNodeId,
    coordinate: endCoord,
    distanceFromStartMeters: cumulative,
    turnType: 'arrive',
    instruction: `Arrive at ${endLandmark}`,
    landmarkName: endLandmark,
    outgoingBearingDeg: 0
  });

  return steps;
}

/**
 * Evaluates live GPS + compass state against the active route, computing
 * upcoming turn guidance, hysteresis-stabilized off-track alerts, and live
 * rejoin direction arrows.
 */
export function evaluateNavigation(
  position: LatLng,
  headingDeg: number | null,
  route: ResolvedRoute,
  wasOffTrack: boolean
): NavigationState {
  const totalMeters = Math.max(1, route.distanceMeters);
  const proj = projectPointToPolyline(position, route.polyline);

  const isOffTrack = wasOffTrack
    ? proj.distanceMeters > OFF_TRACK_EXIT_METERS
    : proj.distanceMeters > OFF_TRACK_ENTER_METERS;

  const rejoinBearingDeg = bearingDeg(position, proj.closestPoint);
  const rejoinRelativeDeg =
    headingDeg !== null ? angleDelta(headingDeg, rejoinBearingDeg) : null;

  const distanceCompletedMeters = Math.max(
    0,
    Math.min(totalMeters, proj.distanceAlongMeters)
  );
  const remainingDistanceMeters = Math.max(
    0,
    totalMeters - distanceCompletedMeters
  );
  const progressRatio = distanceCompletedMeters / totalMeters;

  const endPoint = route.polyline[route.polyline.length - 1];
  const distToEnd = distanceMeters(position, endPoint);
  const hasArrived =
    progressRatio > 0.85 && distToEnd <= ARRIVAL_RADIUS_METERS && !isOffTrack;

  // Find the next upcoming step strictly ahead of our current along-route progress
  let nextStep: TurnStep | null = null;
  for (const step of route.steps) {
    if (step.turnType === 'start') continue;
    if (step.distanceFromStartMeters > distanceCompletedMeters + 6) {
      nextStep = step;
      break;
    }
  }
  if (!nextStep && route.steps.length > 0) {
    nextStep = route.steps[route.steps.length - 1];
  }

  const distanceToNextTurnMeters = nextStep
    ? Math.max(0, nextStep.distanceFromStartMeters - distanceCompletedMeters)
    : remainingDistanceMeters;

  let headline = 'Follow the trail';
  let subline = `${formatDistanceShort(remainingDistanceMeters)} left`;

  if (hasArrived) {
    headline = 'Welcome back to Parking!';
    subline = `Walk complete · ${route.distanceMiles.toFixed(1)} mi`;
  } else if (isOffTrack) {
    const rejoinDist = formatDistanceShort(proj.distanceMeters);
    if (rejoinRelativeDeg !== null) {
      const dirPhrase =
        Math.abs(rejoinRelativeDeg) < 28
          ? 'ahead'
          : Math.abs(rejoinRelativeDeg) > 145
            ? 'behind you'
            : rejoinRelativeDeg < 0
              ? 'to your left'
              : 'to your right';
      headline = `Off trail — walk ${rejoinDist} ${dirPhrase}`;
    } else {
      headline = `Off trail — head ${cardinalDirection(rejoinBearingDeg)} (${rejoinDist})`;
    }
    subline = 'Follow the red arrow back to the trail';
  } else if (nextStep) {
    const distLabel = formatDistanceShort(distanceToNextTurnMeters);
    headline = nextStep.instruction;
    subline =
      distLabel === 'Now'
        ? 'Right here'
        : `In ${distLabel} · ${formatDistanceShort(remainingDistanceMeters)} left`;
  }

  return {
    snappedPoint: proj.closestPoint,
    distanceCompletedMeters,
    remainingDistanceMeters,
    remainingMinutes: Math.max(
      1,
      Math.round(remainingDistanceMeters / WALKING_METERS_PER_MIN)
    ),
    progressRatio,
    crossTrackMeters: proj.distanceMeters,
    isOffTrack,
    rejoinBearingDeg,
    rejoinRelativeDeg,
    nextStep,
    distanceToNextTurnMeters,
    hasArrived,
    headline,
    subline
  };
}
