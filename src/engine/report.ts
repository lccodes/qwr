import type { LatLng, TrailNetwork } from '../types';
import { distanceMeters, formatDistanceShort } from './geo';

export const QWR_REPORT_EMAIL = 'info@quoguewildliferefuge.org';

export type ReportCategory = 'downed-tree' | 'animal-sighting';

export type TreeImpactLevel =
  | 'blocking-trail'
  | 'partially-blocking'
  | 'hanging-overhead'
  | 'off-trail';

export const TREE_IMPACT_LABELS: Record<TreeImpactLevel, string> = {
  'blocking-trail': 'Blocking entire trail',
  'partially-blocking': 'Partially blocking trail',
  'hanging-overhead': 'Leaning / hanging overhead',
  'off-trail': 'Beside trail / minor branch'
};

export interface NearestLandmarkInfo {
  label: string;
  shortName: string | null;
  distanceMeters: number | null;
  isOnRefuge: boolean;
}

/**
 * Offline nearest-landmark lookup using local trail-network.json POIs and trail nodes.
 * Helps QWR staff pinpoint reported downed trees or wildlife sightings even without signal.
 */
export function findNearestLandmark(
  network: TrailNetwork,
  position: LatLng | null
): NearestLandmarkInfo {
  if (!position) {
    return {
      label: 'GPS unavailable — please describe nearby trail or marker',
      shortName: null,
      distanceMeters: null,
      isOnRefuge: false
    };
  }

  const distFromCenter = distanceMeters(position, network.refugeCenter);
  if (distFromCenter > 2500) {
    return {
      label: 'Outside Refuge grounds (please describe trail location)',
      shortName: null,
      distanceMeters: distFromCenter,
      isOnRefuge: false
    };
  }

  let bestName = 'Refuge Trail';
  let bestDist = Infinity;

  for (const poi of network.pois) {
    const d = distanceMeters(position, { lat: poi.lat, lng: poi.lng });
    if (d < bestDist) {
      bestDist = d;
      bestName = poi.name;
    }
  }

  for (const node of network.nodes) {
    if (!node.label) continue;
    const d = distanceMeters(position, { lat: node.lat, lng: node.lng });
    if (d + 15 < bestDist) {
      bestDist = d;
      bestName = node.label;
    }
  }

  const distLabel =
    bestDist < 20 ? 'right at' : `~${formatDistanceShort(bestDist)} from`;

  return {
    label: `${distLabel} ${bestName}`,
    shortName: bestName,
    distanceMeters: bestDist,
    isOnRefuge: true
  };
}

export interface BuildReportEmailParams {
  category: ReportCategory;
  position: LatLng | null;
  isOnRefuge?: boolean;
  nearestLocation?: string;
  nearestShortName?: string | null;
  treeImpact?: TreeImpactLevel;
  species?: string;
  notes?: string;
  reporterName?: string;
  timestamp?: Date;
}

export interface ReportEmailPayload {
  to: string;
  subject: string;
  body: string;
  mailtoHref: string;
  plainTextCopy: string;
}

export function buildReportEmail(
  params: BuildReportEmailParams
): ReportEmailPayload {
  const {
    category,
    position,
    isOnRefuge = true,
    nearestLocation,
    nearestShortName,
    treeImpact = 'blocking-trail',
    species = '',
    notes = '',
    reporterName = '',
    timestamp = new Date()
  } = params;

  const formattedTime = timestamp.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const cleanSpecies = species.trim();
  const cleanNotes = notes.trim();
  const cleanName = reporterName.trim();

  const hasUsableGps = Boolean(position && isOnRefuge);
  const coordsLine = hasUsableGps && position
    ? `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`
    : 'Not on Refuge / GPS not captured';
  const mapsLinkLine = hasUsableGps && position
    ? `https://maps.google.com/?q=${position.lat.toFixed(6)},${position.lng.toFixed(6)}`
    : 'N/A';

  let subject: string;
  const lines: string[] = [];

  if (category === 'downed-tree') {
    subject = nearestShortName
      ? `[QWR Trail Report] Downed Tree — Near ${nearestShortName}`
      : '[QWR Trail Report] Downed Tree';

    lines.push('Hello Quogue Wildlife Refuge Team,');
    lines.push('');
    lines.push('I would like to report a downed tree on the Refuge trails:');
    lines.push('');
    lines.push('Report Type: Downed Tree / Trail Obstruction');
    lines.push(`Trail Impact: ${TREE_IMPACT_LABELS[treeImpact]}`);
    lines.push(
      `Nearest Trail / Landmark: ${nearestLocation || '[Please describe location]'}`
    );
    lines.push(`GPS Coordinates: ${coordsLine}`);
    if (hasUsableGps) {
      lines.push(`Map Pin: ${mapsLinkLine}`);
    }
    lines.push(`Date & Time: ${formattedTime}`);
    lines.push(
      `Details: ${cleanNotes || '[Add any helpful details, e.g. tree size, trail color, or safety notes]'}`
    );
  } else {
    subject = cleanSpecies
      ? `[QWR Trail Report] Animal Sighting — ${cleanSpecies}`
      : nearestShortName
        ? `[QWR Trail Report] Animal Sighting — Near ${nearestShortName}`
        : '[QWR Trail Report] Animal Sighting';

    lines.push('Hello Quogue Wildlife Refuge Team,');
    lines.push('');
    lines.push('I would like to share a wildlife sighting from the Refuge:');
    lines.push('');
    lines.push('Report Type: Animal Sighting');
    lines.push(
      `Animal / Species Observed: ${cleanSpecies || '[e.g. Red Fox, Box Turtle, Barred Owl, Osprey]'}`
    );
    lines.push(
      `Nearest Trail / Landmark: ${nearestLocation || '[Please describe location]'}`
    );
    lines.push(`GPS Coordinates: ${coordsLine}`);
    if (hasUsableGps) {
      lines.push(`Map Pin: ${mapsLinkLine}`);
    }
    lines.push(`Date & Time: ${formattedTime}`);
    lines.push(
      `Behavior / Notes: ${cleanNotes || '[Count, behavior, injured/healthy, photo attached?]'}`
    );
  }

  if (cleanName) {
    lines.push(`Visitor Name / Contact: ${cleanName}`);
  }
  lines.push('');
  lines.push('— Sent via Quogue Wildlife Refuge Trail Navigator');

  const body = lines.join('\n');
  const mailtoHref = `mailto:${QWR_REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const plainTextCopy = `To: ${QWR_REPORT_EMAIL}\nSubject: ${subject}\n\n${body}`;

  return {
    to: QWR_REPORT_EMAIL,
    subject,
    body,
    mailtoHref,
    plainTextCopy
  };
}
