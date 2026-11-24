import type { LatLng, SvgPoint, TrailNetwork } from '../types';

const EARTH_RADIUS_M = 6371000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
export const METERS_PER_MILE = 1609.344;
export const FEET_PER_METER = 3.28084;

/**
 * Great-circle Haversine distance between two WGS84 points in meters.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

export function metersToFeet(meters: number): number {
  return meters * FEET_PER_METER;
}

export function formatDistanceShort(meters: number): string {
  const feet = metersToFeet(meters);
  if (feet < 25) return 'Now';
  if (feet < 1000) {
    const rounded = Math.max(10, Math.round(feet / 10) * 10);
    return `${rounded} ft`;
  }
  const miles = metersToMiles(meters);
  return `${miles.toFixed(2)} mi`;
}

export function formatMiles(meters: number): string {
  const mi = metersToMiles(meters);
  if (mi < 0.1) {
    return `${Math.round(metersToFeet(meters))} ft`;
  }
  return `${mi.toFixed(1)} mi`;
}

/**
 * Normalize angle to [0, 360).
 */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Signed shortest angular difference from `fromDeg` to `toDeg` in (-180, 180].
 * Positive values turn clockwise (right); negative values turn counter-clockwise (left).
 */
export function angleDelta(fromDeg: number, toDeg: number): number {
  let diff = normalizeAngle(toDeg) - normalizeAngle(fromDeg);
  if (diff > 180) diff -= 360;
  if (diff <= -180) diff += 360;
  return diff;
}

/**
 * Initial compass bearing from `a` to `b` in degrees [0, 360), where 0 = North, 90 = East.
 */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeAngle(Math.atan2(y, x) * RAD_TO_DEG);
}

/**
 * Offset a coordinate by (northMeters, eastMeters) using local tangent plane approximation.
 */
export function offsetLatLng(
  origin: LatLng,
  northMeters: number,
  eastMeters: number
): LatLng {
  const dLat = (northMeters / EARTH_RADIUS_M) * RAD_TO_DEG;
  const cosLat = Math.cos(origin.lat * DEG_TO_RAD);
  const dLng = (eastMeters / (EARTH_RADIUS_M * cosLat)) * RAD_TO_DEG;
  return {
    lat: origin.lat + dLat,
    lng: origin.lng + dLng
  };
}

export function polylineLengthMeters(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distanceMeters(points[i - 1], points[i]);
  }
  return total;
}

export interface PolylineProjection {
  closestPoint: LatLng;
  distanceMeters: number;
  distanceAlongMeters: number;
  segmentIndex: number;
  segmentBearingDeg: number;
}

/**
 * Project a point onto a polyline using local cosine-corrected planar projection
 * for fast, accurate cross-track distance and along-route progress.
 */
export function projectPointToPolyline(
  point: LatLng,
  polyline: LatLng[]
): PolylineProjection {
  if (polyline.length === 0) {
    return {
      closestPoint: point,
      distanceMeters: Infinity,
      distanceAlongMeters: 0,
      segmentIndex: 0,
      segmentBearingDeg: 0
    };
  }
  if (polyline.length === 1) {
    return {
      closestPoint: polyline[0],
      distanceMeters: distanceMeters(point, polyline[0]),
      distanceAlongMeters: 0,
      segmentIndex: 0,
      segmentBearingDeg: 0
    };
  }

  const refLatRad = point.lat * DEG_TO_RAD;
  const metersPerDegLat = 111132.92;
  const metersPerDegLng = 111412.84 * Math.cos(refLatRad);

  const toXY = (p: LatLng) => ({
    x: (p.lng - point.lng) * metersPerDegLng,
    y: (p.lat - point.lat) * metersPerDegLat
  });

  let bestDistSq = Infinity;
  let bestPoint: LatLng = polyline[0];
  let bestAlong = 0;
  let bestSegIdx = 0;
  let bestBearing = 0;
  let cumulative = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const segLen = distanceMeters(a, b);
    const pa = toXY(a);
    const pb = toXY(b);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 1e-6) {
      t = Math.max(0, Math.min(1, -(pa.x * dx + pa.y * dy) / lenSq));
    }

    const projX = pa.x + t * dx;
    const projY = pa.y + t * dy;
    const distSq = projX * projX + projY * projY;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestPoint = {
        lat: a.lat + t * (b.lat - a.lat),
        lng: a.lng + t * (b.lng - a.lng)
      };
      bestAlong = cumulative + t * segLen;
      bestSegIdx = i;
      bestBearing = bearingDeg(a, b);
    }

    cumulative += segLen;
  }

  return {
    closestPoint: bestPoint,
    distanceMeters: Math.sqrt(bestDistSq),
    distanceAlongMeters: bestAlong,
    segmentIndex: bestSegIdx,
    segmentBearingDeg: bestBearing
  };
}

/**
 * Sample a coordinate and forward bearing at `targetMeters` along a polyline.
 */
export function interpolateAlongPolyline(
  polyline: LatLng[],
  targetMeters: number
): { point: LatLng; bearingDeg: number; progressRatio: number } {
  const total = polylineLengthMeters(polyline);
  if (polyline.length < 2 || total <= 0) {
    return {
      point: polyline[0] ?? { lat: 40.834, lng: -72.615 },
      bearingDeg: 0,
      progressRatio: 0
    };
  }

  const clamped = Math.max(0, Math.min(total, targetMeters));
  let acc = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const segLen = distanceMeters(a, b);
    if (acc + segLen >= clamped || i === polyline.length - 2) {
      const t = segLen > 0 ? Math.max(0, Math.min(1, (clamped - acc) / segLen)) : 0;
      return {
        point: {
          lat: a.lat + t * (b.lat - a.lat),
          lng: a.lng + t * (b.lng - a.lng)
        },
        bearingDeg: bearingDeg(a, b),
        progressRatio: clamped / total
      };
    }
    acc += segLen;
  }

  const last = polyline[polyline.length - 1];
  const prev = polyline[polyline.length - 2];
  return {
    point: last,
    bearingDeg: bearingDeg(prev, last),
    progressRatio: 1
  };
}

export interface MapProjector {
  latLngToSvg: (coord: LatLng | [number, number]) => SvgPoint;
  svgToLatLng: (pt: SvgPoint) => LatLng;
  metersPerSvgUnit: number;
  width: number;
  height: number;
}

/**
 * Builds an isotropic local tangent-plane projector mapping WGS84 bounds cleanly
 * into the SVG coordinate system with equal North-South and East-West meter scale.
 */
export function createMapProjector(network: TrailNetwork): MapProjector {
  const { bounds, svgViewBox, refugeCenter } = network;
  const cosLat = Math.cos(refugeCenter.lat * DEG_TO_RAD);

  const widthDegCorrected = (bounds.east - bounds.west) * cosLat;
  const heightDeg = bounds.north - bounds.south;

  const usableW = svgViewBox.width - svgViewBox.padding * 2;
  const usableH = svgViewBox.height - svgViewBox.padding * 2;

  const scaleX = usableW / widthDegCorrected;
  const scaleY = usableH / heightDeg;
  const scale = Math.min(scaleX, scaleY);

  const drawnW = widthDegCorrected * scale;
  const drawnH = heightDeg * scale;
  const offsetX = (svgViewBox.width - drawnW) / 2;
  const offsetY = (svgViewBox.height - drawnH) / 2;

  const latLngToSvg = (coord: LatLng | [number, number]): SvgPoint => {
    const lat = Array.isArray(coord) ? coord[0] : coord.lat;
    const lng = Array.isArray(coord) ? coord[1] : coord.lng;
    const x = offsetX + (lng - bounds.west) * cosLat * scale;
    const y = offsetY + (bounds.north - lat) * scale;
    return { x, y };
  };

  const svgToLatLng = (pt: SvgPoint): LatLng => {
    const lng = bounds.west + (pt.x - offsetX) / (cosLat * scale);
    const lat = bounds.north - (pt.y - offsetY) / scale;
    return { lat, lng };
  };

  // 1 degree of latitude ≈ 111,132.92 meters
  const metersPerSvgUnit = 111132.92 / scale;

  return {
    latLngToSvg,
    svgToLatLng,
    metersPerSvgUnit,
    width: svgViewBox.width,
    height: svgViewBox.height
  };
}
