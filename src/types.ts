export interface LatLng {
  lat: number;
  lng: number;
}

export interface SvgPoint {
  x: number;
  y: number;
}

export type HabitatType =
  | 'dwarf-pine-barrens'
  | 'pine-barrens'
  | 'pine-oak-forest'
  | 'bog'
  | 'swamp'
  | 'forest-regeneration'
  | 'field';

export type PoiCategory =
  | 'entry'
  | 'wildlife'
  | 'water'
  | 'landmark'
  | 'amenity'
  | 'garden';

export type LoopColorId = 'purple' | 'yellow' | 'blue' | 'red';

export interface TrailNode {
  id: string;
  lat: number;
  lng: number;
  label?: string;
}

export interface TrailSegment {
  id: string;
  name: string;
  from: string;
  to: string;
  /** Ordered polyline coordinates starting at `from` and ending at `to` */
  waypoints: [number, number][]; // [lat, lng]
  habitat: HabitatType;
  surface?: 'dirt' | 'boardwalk' | 'gravel' | 'bridge' | 'roadside';
  isNewTrail?: boolean;
  /** Optional standard loops that canonically include this segment */
  loops?: LoopColorId[];
}

export interface StandardLoopDef {
  id: string;
  colorId: LoopColorId;
  name: string;
  shortName: string;
  colorHex: string;
  badgeShape: 'circle' | 'diamond' | 'square' | 'triangle';
  canonicalMiles: number;
  difficulty: 'Easy' | 'Moderate';
  summary: string;
  highlights: string[];
  /** Ordered canonical node IDs forming the loop (starts & ends at `parking`) */
  canonicalNodeIds: string[];
  /** Key scenic anchor nodes preserved when computing an automatic closure detour */
  detourAnchors: string[];
}

export interface PoiDef {
  id: string;
  name: string;
  shortName: string;
  category: PoiCategory;
  icon:
    | 'parking'
    | 'nature-center'
    | 'cottage'
    | 'animals'
    | 'butterfly'
    | 'greenhouse'
    | 'restrooms'
    | 'field'
    | 'pond'
    | 'bridge'
    | 'bluebird'
    | 'ice-exhibit'
    | 'amphitheater'
    | 'dwarf-pines'
    | 'boardwalk';
  lat: number;
  lng: number;
  nodeId: string;
  description: string;
  kidTip: string;
  selectableForCustomWalk: boolean;
}

export interface PolygonFeature {
  id: string;
  name: string;
  kind:
    | HabitatType
    | 'water'
    | 'preserve-boundary'
    | 'closed-zone'
    | 'parking-lot'
    | 'building'
    | 'building-closed';
  /** Polygon ring coordinates as [lat, lng][] */
  coordinates: [number, number][];
  labelPosition?: [number, number];
}

export interface LineFeature {
  id: string;
  name: string;
  kind: 'fence' | 'railroad' | 'creek' | 'arrow' | 'road';
  coordinates: [number, number][];
}

export interface TrailNetwork {
  version: string;
  sourceNote: string;
  refugeCenter: LatLng;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  svgViewBox: {
    width: number;
    height: number;
    padding: number;
  };
  nodes: TrailNode[];
  segments: TrailSegment[];
  standardLoops: StandardLoopDef[];
  pois: PoiDef[];
  waterBodies: PolygonFeature[];
  habitats: PolygonFeature[];
  builtFeatures?: PolygonFeature[];
  boundaryPolygon: [number, number][];
  decorLines: LineFeature[];
}

export type SegmentStatusValue = 'open' | 'closed' | 'caution';

export interface SegmentStatusEntry {
  name: string;
  status: SegmentStatusValue;
  reason?: string;
  badge?: 'new' | 'caution';
  updated?: string;
}

export interface FacilityStatusEntry {
  name: string;
  status: 'open' | 'closed' | 'limited';
  note?: string;
}

export interface TrailStatusConfig {
  schemaVersion: string;
  lastUpdated: string;
  refugePhone: string;
  globalAlert?: {
    active: boolean;
    severity: 'info' | 'warning';
    title: string;
    message: string;
  };
  facilities: Record<string, FacilityStatusEntry>;
  segments: Record<string, SegmentStatusEntry>;
}

export type TurnType =
  | 'start'
  | 'straight'
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'slight-right'
  | 'right'
  | 'sharp-right'
  | 'u-turn'
  | 'arrive';

export interface TurnStep {
  index: number;
  nodeId: string;
  coordinate: LatLng;
  distanceFromStartMeters: number;
  turnType: TurnType;
  instruction: string;
  landmarkName?: string;
  /** Outgoing compass bearing in degrees [0, 360) */
  outgoingBearingDeg: number;
}

export interface ResolvedRoute {
  id: string;
  kind: 'standard' | 'custom' | 'return-to-parking';
  title: string;
  subtitle: string;
  colorHex: string;
  loopColorId?: LoopColorId;
  nodeIds: string[];
  segmentIds: string[];
  /** Dense ordered polyline coordinates along the route */
  polyline: LatLng[];
  distanceMeters: number;
  distanceMiles: number;
  estimatedMinutes: number;
  isDetoured: boolean;
  detourNote?: string;
  avoidedClosedSegments: string[];
  selectedPoiIds?: string[];
  unreachablePoiIds?: string[];
  steps: TurnStep[];
}

export interface NavigationState {
  /** Snapped position along the active route */
  snappedPoint: LatLng;
  /** Progress along route in meters from start */
  distanceCompletedMeters: number;
  remainingDistanceMeters: number;
  remainingMinutes: number;
  progressRatio: number;
  /** Perpendicular distance from active route polyline */
  crossTrackMeters: number;
  isOffTrack: boolean;
  /** Absolute compass bearing from user back to nearest point on route */
  rejoinBearingDeg: number;
  /** Relative turn angle from user's current heading toward route (-180..180) */
  rejoinRelativeDeg: number | null;
  nextStep: TurnStep | null;
  distanceToNextTurnMeters: number;
  hasArrived: boolean;
  headline: string;
  subline: string;
}

export interface SunsetInfo {
  sunriseText: string;
  sunsetText: string;
  minutesUntilSunset: number;
  status: 'open' | 'closing-soon' | 'after-sunset';
  label: string;
}
