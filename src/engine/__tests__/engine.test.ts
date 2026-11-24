import { describe, expect, it } from 'vitest';
import type { TrailNetwork, TrailStatusConfig } from '../../types';
import rawNetwork from '../../../public/data/trail-network.json';
import rawStatus from '../../../public/data/trail-status.json';
import {
  angleDelta,
  bearingDeg,
  createMapProjector,
  distanceMeters,
  offsetLatLng,
  projectPointToPolyline
} from '../geo';
import {
  buildCustomWalk,
  resolveStandardLoop,
  routeBackToParking
} from '../router';
import { evaluateNavigation } from '../navigation';
import { computeQuogueSolarTimes, getRefugeSunsetInfo } from '../sunset';

const network = rawNetwork as unknown as TrailNetwork;
const dec2025Status = rawStatus as unknown as TrailStatusConfig;

const allOpenStatus: TrailStatusConfig = {
  ...dec2025Status,
  segments: {}
};

describe('geo engine', () => {
  it('computes accurate bearings and wrap-around angle deltas', () => {
    const origin = { lat: 40.8345, lng: -72.6152 };
    const north = offsetLatLng(origin, 100, 0);
    const east = offsetLatLng(origin, 0, 100);
    expect(bearingDeg(origin, north)).toBeCloseTo(0, 0);
    expect(bearingDeg(origin, east)).toBeCloseTo(90, 0);
    expect(distanceMeters(origin, north)).toBeCloseTo(100, 0);
    expect(angleDelta(350, 10)).toBeCloseTo(20, 5);
    expect(angleDelta(10, 350)).toBeCloseTo(-20, 5);
  });

  it('round-trips lat/lng through the isotropic SVG projector', () => {
    const projector = createMapProjector(network);
    const sample = { lat: 40.83979, lng: -72.61668 };
    const svg = projector.latLngToSvg(sample);
    const back = projector.svgToLatLng(svg);
    expect(back.lat).toBeCloseTo(sample.lat, 5);
    expect(back.lng).toBeCloseTo(sample.lng, 5);
  });

  it('projects an off-track point accurately onto a polyline', () => {
    const a = { lat: 40.835, lng: -72.616 };
    const b = offsetLatLng(a, 100, 0);
    const eastOfMid = offsetLatLng(a, 50, 30);
    const proj = projectPointToPolyline(eastOfMid, [a, b]);
    expect(proj.distanceMeters).toBeCloseTo(30, 0);
    expect(proj.distanceAlongMeters).toBeCloseTo(50, 0);
  });

  it('keeps every in-refuge trail waypoint strictly inside boundaryPolygon', () => {
    const ring = network.boundaryPolygon;
    const isInside = (lat: number, lng: number) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [yi, xi] = ring[i];
        const [yj, xj] = ring[j];
        if (
          yi > lat !== yj > lat &&
          lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi
        ) {
          inside = !inside;
        }
      }
      return inside;
    };

    for (const seg of network.segments) {
      if (seg.id.startsWith('fairy-dell')) continue;
      for (const [lat, lng] of seg.waypoints) {
        expect(isInside(lat, lng), `${seg.id} waypoint (${lat},${lng}) crossed boundary`).toBe(true);
      }
    }
  });
});

describe('closure-aware trail router', () => {
  it('automatically detours all 4 standard loops around Dec 2025 closures', () => {
    const closedSet = new Set(
      Object.entries(dec2025Status.segments)
        .filter(([, s]) => s.status === 'closed')
        .map(([id]) => id)
    );

    for (const loop of network.standardLoops) {
      const route = resolveStandardLoop(network, dec2025Status, loop.id);
      expect(route).not.toBeNull();
      expect(route!.isDetoured).toBe(true);
      expect(route!.avoidedClosedSegments.length).toBeGreaterThan(0);
      expect(route!.nodeIds[0]).toBe('parking');
      expect(route!.nodeIds[route!.nodeIds.length - 1]).toBe('parking');
      for (const segId of route!.segmentIds) {
        expect(closedSet.has(segId)).toBe(false);
      }
      expect(route!.steps.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('restores exact canonical loops automatically when closures reopen', () => {
    const expectedMiles: Record<string, number> = {
      'green-08': 0.8,
      'yellow-14': 1.4,
      'blue-25': 2.5,
      'red-31': 3.1
    };

    for (const loop of network.standardLoops) {
      const route = resolveStandardLoop(network, allOpenStatus, loop.id);
      expect(route).not.toBeNull();
      expect(route!.isDetoured).toBe(false);
      expect(route!.avoidedClosedSegments).toHaveLength(0);
      expect(route!.distanceMiles).toBeCloseTo(expectedMiles[loop.id], 1);
    }
  });

  it('builds shortest open multi-stop custom walks returning to Parking', () => {
    const route = buildCustomWalk(network, dec2025Status, [
      'deer-pond',
      'bluebird-nestboxes',
      'the-bridge'
    ]);
    expect(route).not.toBeNull();
    expect(route!.nodeIds[0]).toBe('parking');
    expect(route!.nodeIds[route!.nodeIds.length - 1]).toBe('parking');
    expect(route!.nodeIds).toContain('deer-pond-overlook');
    expect(route!.nodeIds).toContain('new-trail-se');
    expect(route!.nodeIds).toContain('bridge-west');
    expect(route!.unreachablePoiIds).toHaveLength(0);
    // Must not touch closed segments
    expect(route!.segmentIds).not.toContain('west-fence-south-inner');
    expect(route!.segmentIds).not.toContain('old-ice-pond-nw-spur');
  });

  it('routes directly to Fairy Dell Boardwalk and back', () => {
    const route = buildCustomWalk(network, dec2025Status, ['fairy-dell']);
    expect(route).not.toBeNull();
    expect(route!.nodeIds).toContain('fairy-dell-overlook');
    expect(route!.nodeIds[route!.nodeIds.length - 1]).toBe('parking');
  });

  it('computes safe Back-to-Parking route from deep inside the refuge', () => {
    const deepInNorth = { lat: 40.8485, lng: -72.6166 };
    const rescue = routeBackToParking(network, dec2025Status, deepInNorth);
    expect(rescue).not.toBeNull();
    expect(rescue!.nodeIds[rescue!.nodeIds.length - 1]).toBe('parking');
    expect(rescue!.segmentIds).not.toContain('west-fence-mid-south');
  });
});

describe('turn-by-turn & off-track navigation', () => {
  it('triggers off-track alert beyond 22m with accurate rejoin arrow and clears under 14m', () => {
    const route = resolveStandardLoop(network, dec2025Status, 'blue-25')!;
    // Pick a point on the straight East Fence trail (eastmost side of the refuge)
    const onTrailPt = route.polyline.reduce((eastmost, pt) =>
      pt.lng > eastmost.lng ? pt : eastmost
    );

    // On trail -> not off track
    const onState = evaluateNavigation(onTrailPt, 0, route, false);
    expect(onState.isOffTrack).toBe(false);

    // 35m east of the eastmost fence line -> guaranteed 35m off-track, pointing west (~270°)
    const offPt = offsetLatLng(onTrailPt, 0, 35);
    const offState = evaluateNavigation(offPt, 0, route, false);
    expect(offState.isOffTrack).toBe(true);
    expect(offState.rejoinBearingDeg).toBeGreaterThan(220);
    expect(offState.rejoinBearingDeg).toBeLessThan(320);
    // Facing North (0°), west is to our left (negative relative angle)
    expect(offState.rejoinRelativeDeg).not.toBeNull();
    expect(offState.rejoinRelativeDeg!).toBeLessThan(0);

    // 18m away while already off-track -> stays off-track due to hysteresis (> 14m)
    const midPt = offsetLatLng(onTrailPt, 0, 18);
    const hystState = evaluateNavigation(midPt, 0, route, true);
    expect(hystState.isOffTrack).toBe(true);

    // 8m away -> clears off-track (< 14m)
    const backPt = offsetLatLng(onTrailPt, 0, 8);
    const clearedState = evaluateNavigation(backPt, 0, route, true);
    expect(clearedState.isOffTrack).toBe(false);
  });
});

describe('offline NOAA sunset calculator', () => {
  it('computes accurate Quogue NY sunrise & sunset times in winter and summer', () => {
    // Dec 21 noon EST (17:00 UTC) -> sunset around 4:25 PM EST
    const winter = computeQuogueSolarTimes(new Date('2026-12-21T17:00:00Z'));
    const winterHourNy = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hour12: false
      }).format(winter.sunsetUtc)
    );
    expect(winterHourNy).toBe(16);

    // June 21 noon EDT (16:00 UTC) -> sunset around 8:24 PM EDT
    const summer = computeQuogueSolarTimes(new Date('2026-06-21T16:00:00Z'));
    const summerHourNy = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hour12: false
      }).format(summer.sunsetUtc)
    );
    expect(summerHourNy).toBe(20);

    // 25 minutes before winter sunset triggers closing-soon
    const nearClose = new Date(winter.sunsetUtc.getTime() - 25 * 60000);
    const info = getRefugeSunsetInfo(nearClose);
    expect(info.status).toBe('closing-soon');
  });
});
