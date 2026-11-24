import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Layers,
  LocateFixed,
  Minus,
  Plus
} from 'lucide-react';
import type {
  LatLng,
  NavigationState,
  PoiDef,
  ResolvedRoute,
  SvgPoint,
  TrailNetwork,
  TrailStatusConfig
} from '../types';
import { createMapProjector, interpolateAlongPolyline } from '../engine/geo';
import { isSegmentOpen } from '../engine/router';

interface RefugeMapProps {
  network: TrailNetwork;
  status: TrailStatusConfig;
  activeRoute: ResolvedRoute | null;
  selectedPoiIds: string[];
  isNavigating: boolean;
  userPosition: LatLng | null;
  accuracyMeters: number | null;
  headingDeg: number | null;
  navState: NavigationState | null;
  headingUp: boolean;
  onToggleHeadingUp: () => void;
  onSelectPoi: (poi: PoiDef) => void;
  simTapToMove: boolean;
  onMapTeleport: (coord: LatLng) => void;
}

interface TreeGlyph {
  lat: number;
  lng: number;
  kind: 'dwarf' | 'pine' | 'oak' | 'sprout';
  scale: number;
}

/** Curated decorative botanical clusters placed in real QWR habitat zones (away from ponds) */
const BOTANICAL_GLYPHS: TreeGlyph[] = [
  // Dwarf Pine Barrens (far north)
  { lat: 40.8483, lng: -72.6169, kind: 'dwarf', scale: 0.9 },
  { lat: 40.8477, lng: -72.6176, kind: 'dwarf', scale: 0.85 },
  { lat: 40.8474, lng: -72.6165, kind: 'dwarf', scale: 0.95 },
  { lat: 40.8467, lng: -72.6184, kind: 'dwarf', scale: 0.85 },
  { lat: 40.8465, lng: -72.6171, kind: 'dwarf', scale: 0.9 },
  { lat: 40.8461, lng: -72.6159, kind: 'dwarf', scale: 0.85 },
  { lat: 40.8458, lng: -72.6188, kind: 'dwarf', scale: 0.9 },
  { lat: 40.8456, lng: -72.6177, kind: 'dwarf', scale: 0.85 },
  // Pine Barrens (mid-north west & around Deer Pond)
  { lat: 40.8442, lng: -72.6185, kind: 'pine', scale: 1.05 },
  { lat: 40.8440, lng: -72.6168, kind: 'pine', scale: 1.0 },
  { lat: 40.8431, lng: -72.6187, kind: 'pine', scale: 1.1 },
  { lat: 40.8428, lng: -72.6174, kind: 'pine', scale: 1.0 },
  { lat: 40.8421, lng: -72.6185, kind: 'pine', scale: 1.05 },
  { lat: 40.8415, lng: -72.6173, kind: 'pine', scale: 1.05 },
  { lat: 40.8410, lng: -72.6186, kind: 'pine', scale: 1.0 },
  { lat: 40.8404, lng: -72.6175, kind: 'pine', scale: 1.0 },
  { lat: 40.8424, lng: -72.6149, kind: 'pine', scale: 0.95 },
  { lat: 40.8407, lng: -72.6145, kind: 'pine', scale: 0.95 },
  { lat: 40.8376, lng: -72.6182, kind: 'pine', scale: 1.0 },
  { lat: 40.8373, lng: -72.6174, kind: 'pine', scale: 0.95 },
  { lat: 40.8358, lng: -72.6185, kind: 'pine', scale: 0.95 },
  // Forest Regeneration Sprouts
  { lat: 40.8393, lng: -72.6186, kind: 'sprout', scale: 1.0 },
  { lat: 40.8388, lng: -72.6182, kind: 'sprout', scale: 1.0 },
  { lat: 40.8386, lng: -72.6175, kind: 'sprout', scale: 0.95 },
  { lat: 40.8392, lng: -72.6173, kind: 'sprout', scale: 0.9 },
  // Pine Oak Forest (east & southeast)
  { lat: 40.8385, lng: -72.6143, kind: 'oak', scale: 1.0 },
  { lat: 40.8375, lng: -72.6144, kind: 'oak', scale: 1.05 },
  { lat: 40.8362, lng: -72.6147, kind: 'oak', scale: 0.95 },
  { lat: 40.8355, lng: -72.6156, kind: 'oak', scale: 0.9 },
  { lat: 40.8342, lng: -72.6140, kind: 'oak', scale: 0.95 },
  // Fairy Dell wetlands trees
  { lat: 40.8321, lng: -72.6164, kind: 'oak', scale: 0.85 },
  { lat: 40.8313, lng: -72.6165, kind: 'oak', scale: 0.85 }
];

function coordsToSvgPath(
  coords: ([number, number] | LatLng)[],
  toSvg: (c: [number, number] | LatLng) => SvgPoint,
  close = false
): string {
  if (coords.length === 0) return '';
  const parts = coords.map((c, idx) => {
    const p = toSvg(c);
    return `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  });
  if (close) parts.push('Z');
  return parts.join(' ');
}

function PoiIconGlyph({ icon }: { icon: PoiDef['icon'] }) {
  switch (icon) {
    case 'parking':
      return (
        <text
          x="0"
          y="4.5"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill="#FFFFFF"
        >
          P
        </text>
      );
    case 'animals':
      return (
        <g fill="#FFFFFF">
          <circle cx="-3" cy="-2" r="2.1" />
          <circle cx="3" cy="-2" r="2.1" />
          <path d="M-4.5 4.2 C-4.5 1.2 4.5 1.2 4.5 4.2 Z" />
        </g>
      );
    case 'pond':
      return (
        <path
          d="M-5.5 0.5 Q-2.5 -2.5 0 0.5 T5.5 0.5 M-4.5 3.8 Q-2 1.5 0.5 3.8 T4.5 3.8"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      );
    case 'bridge':
      return (
        <path
          d="M-6 2 Q0 -4 6 2 M-5 -1.5 L-5 3.5 M5 -1.5 L5 3.5 M-6 3.5 L6 3.5"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      );
    case 'bluebird':
      return (
        <path
          d="M-5 2.5 C-2 -3.5 3 -4.5 6 -1.5 C3.5 0.5 2 3.5 -2 3.8 Z"
          fill="#FFFFFF"
        />
      );
    case 'butterfly':
      return (
        <g fill="#FFFFFF">
          <ellipse cx="-3" cy="-1.5" rx="3" ry="2.2" transform="rotate(-25 -3 -1.5)" />
          <ellipse cx="3" cy="-1.5" rx="3" ry="2.2" transform="rotate(25 3 -1.5)" />
          <ellipse cx="-2.4" cy="2.2" rx="2.1" ry="1.6" transform="rotate(20 -2.4 2.2)" />
          <ellipse cx="2.4" cy="2.2" rx="2.1" ry="1.6" transform="rotate(-20 2.4 2.2)" />
        </g>
      );
    case 'restrooms':
      return (
        <text
          x="0"
          y="4"
          textAnchor="middle"
          fontSize="9.5"
          fontWeight="800"
          fill="#FFFFFF"
        >
          WC
        </text>
      );
    case 'dwarf-pines':
      return (
        <path
          d="M0 -6 L-4.5 0 L-2 0 L-5 4.5 L5 4.5 L2 0 L4.5 0 Z"
          fill="#FFFFFF"
        />
      );
    case 'boardwalk':
      return (
        <path
          d="M-5.5 -2.5 L5.5 -2.5 M-5.5 0.5 L5.5 0.5 M-5.5 3.5 L5.5 3.5"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      );
    case 'nature-center':
    case 'ice-exhibit':
      return (
        <path
          d="M-5.5 0 L0 -5 L5.5 0 L4.2 0 L4.2 4.5 L-4.2 4.5 L-4.2 0 Z"
          fill="#FFFFFF"
        />
      );
    default:
      return <circle cx="0" cy="0" r="3.5" fill="#FFFFFF" />;
  }
}

function poiPinFill(poi: PoiDef, isSelected: boolean): string {
  if (isSelected) return '#D97706';
  switch (poi.category) {
    case 'entry':
      return '#1B4332';
    case 'water':
      return '#1E74A8';
    case 'wildlife':
      return '#2B6E47';
    case 'garden':
      return '#B96A1E';
    case 'amenity':
      return '#4A5D52';
    default:
      return '#335E4A';
  }
}

export const RefugeMap: React.FC<RefugeMapProps> = ({
  network,
  status,
  activeRoute,
  selectedPoiIds,
  isNavigating,
  userPosition,
  accuracyMeters,
  headingDeg,
  navState,
  headingUp,
  onToggleHeadingUp,
  onSelectPoi,
  simTapToMove,
  onMapTeleport
}) => {
  const projector = useMemo(() => createMapProjector(network), [network]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 390, height: 844 });

  // Camera state in SVG coordinates
  const defaultFocus = useMemo(
    () => projector.latLngToSvg({ lat: 40.8395, lng: -72.6166 }),
    [projector]
  );

  const [camCenter, setCamCenter] = useState<SvgPoint>(defaultFocus);
  const [zoom, setZoom] = useState(0.95);
  const [followUser, setFollowUser] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  // Track container dimensions for exact screen <-> SVG coordinate math
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setViewportSize({
        width: el.clientWidth || 390,
        height: el.clientHeight || 844
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute ideal fit scale so full refuge sits comfortably above the bottom sheet
  const baseScale = useMemo(() => {
    const sx = viewportSize.width / projector.width;
    const sy = (viewportSize.height * 0.72) / projector.height;
    return Math.min(sx, sy);
  }, [viewportSize, projector]);

  // Smoothly center on route preview when selecting a trail in explore mode
  useEffect(() => {
    if (isNavigating) {
      setFollowUser(true);
      setZoom((prev) => (prev < 1.9 ? 2.25 : prev));
      return;
    }
    setFollowUser(false);
    if (activeRoute && activeRoute.polyline.length > 0) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const p of activeRoute.polyline) {
        const s = projector.latLngToSvg(p);
        if (s.x < minX) minX = s.x;
        if (s.x > maxX) maxX = s.x;
        if (s.y < minY) minY = s.y;
        if (s.y > maxY) maxY = s.y;
      }
      setCamCenter({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
      const spanW = Math.max(150, maxX - minX + 110);
      const spanH = Math.max(200, maxY - minY + 130);
      const targetScale = Math.min(
        (viewportSize.width * 0.78) / spanW,
        (viewportSize.height * 0.37) / spanH
      );
      const nextZoom = Math.max(0.75, Math.min(1.65, targetScale / baseScale));
      setZoom(nextZoom);
    } else {
      setCamCenter({ x: defaultFocus.x, y: defaultFocus.y });
      setZoom(0.84);
    }
  }, [activeRoute?.id, isNavigating, projector, baseScale, viewportSize, defaultFocus]);

  // Keep camera locked onto live GPS position when following
  useEffect(() => {
    if (!followUser || !userPosition) return;
    const pt = projector.latLngToSvg(userPosition);
    setCamCenter(pt);
  }, [followUser, userPosition, projector]);

  const effectiveScale = baseScale * zoom;
  const mapRotationDeg =
    isNavigating && headingUp && headingDeg !== null ? headingDeg : 0;

  // Center the map cleanly in the visible window above the bottom sheet
  const screenPivotX = viewportSize.width * 0.48;
  const screenPivotY = isNavigating
    ? viewportSize.height * 0.52
    : viewportSize.height * 0.31;

  // Multi-touch pan & pinch-zoom state
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{
    lastMidX: number;
    lastMidY: number;
    lastDist: number;
    moved: boolean;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pts = Array.from(pointersRef.current.values());
    if (pts.length === 1) {
      gestureRef.current = {
        lastMidX: pts[0].x,
        lastMidY: pts[0].y,
        lastDist: 0,
        moved: false
      };
    } else if (pts.length === 2) {
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      gestureRef.current = {
        lastMidX: midX,
        lastMidY: midY,
        lastDist: dist,
        moved: true
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointersRef.current.values());
    const g = gestureRef.current;
    if (!g) return;

    if (pts.length === 1) {
      const dx = pts[0].x - g.lastMidX;
      const dy = pts[0].y - g.lastMidY;
      if (Math.hypot(dx, dy) > 4) g.moved = true;
      g.lastMidX = pts[0].x;
      g.lastMidY = pts[0].y;

      // Rotate pan vector into SVG world space when heading-up is rotated
      const rad = (mapRotationDeg * Math.PI) / 180;
      const worldDx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / effectiveScale;
      const worldDy = (dx * Math.sin(rad) + dy * Math.cos(rad)) / effectiveScale;

      setFollowUser(false);
      setCamCenter((prev) => ({
        x: Math.max(-80, Math.min(projector.width + 80, prev.x - worldDx)),
        y: Math.max(-80, Math.min(projector.height + 80, prev.y - worldDy))
      }));
    } else if (pts.length === 2) {
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (g.lastDist > 10 && dist > 10) {
        const factor = dist / g.lastDist;
        setZoom((z) => Math.max(0.72, Math.min(4.5, z * factor)));
      }
      g.lastMidX = midX;
      g.lastMidY = midY;
      g.lastDist = dist;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasTap = gestureRef.current && !gestureRef.current.moved;
    pointersRef.current.delete(e.pointerId);

    if (wasTap && simTapToMove && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left - screenPivotX;
      const sy = e.clientY - rect.top - screenPivotY;
      const rad = (mapRotationDeg * Math.PI) / 180;
      const worldX =
        camCenter.x + (sx * Math.cos(rad) - sy * Math.sin(rad)) / effectiveScale;
      const worldY =
        camCenter.y + (sx * Math.sin(rad) + sy * Math.cos(rad)) / effectiveScale;
      const coord = projector.svgToLatLng({ x: worldX, y: worldY });
      onMapTeleport(coord);
    }

    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.72, Math.min(4.5, z * factor)));
  };

  const handleRecenter = useCallback(() => {
    if (userPosition) {
      setFollowUser(true);
      setCamCenter(projector.latLngToSvg(userPosition));
      setZoom((z) => Math.max(z, 2.1));
    } else {
      setCamCenter({ x: defaultFocus.x, y: defaultFocus.y });
      setZoom(0.84);
    }
  }, [userPosition, projector, defaultFocus]);

  // Precompute evenly spaced active route directional chevrons (deduping overlaps on out-and-back legs)
  const routeChevrons = useMemo(() => {
    if (!activeRoute || activeRoute.polyline.length < 2) return [];
    const total = activeRoute.distanceMeters;
    const step = total > 2500 ? 240 : total > 1200 ? 175 : 130;
    const out: { x: number; y: number; deg: number }[] = [];
    for (let d = step * 0.55; d < total - step * 0.4; d += step) {
      const sample = interpolateAlongPolyline(activeRoute.polyline, d);
      const pt = projector.latLngToSvg(sample.point);
      const tooClose = out.some((c) => Math.hypot(c.x - pt.x, c.y - pt.y) < 26);
      if (!tooClose) {
        out.push({ x: pt.x, y: pt.y, deg: sample.bearingDeg });
      }
    }
    return out;
  }, [activeRoute, projector]);

  // Compute closed trail barrier markers at junctions where an open edge meets a closed edge
  const closedBarrierPoints = useMemo(() => {
    const openNodes = new Set<string>();
    const closedNodes = new Set<string>();
    for (const seg of network.segments) {
      if (isSegmentOpen(seg.id, status)) {
        openNodes.add(seg.from);
        openNodes.add(seg.to);
      } else {
        closedNodes.add(seg.from);
        closedNodes.add(seg.to);
      }
    }
    const pts: SvgPoint[] = [];
    for (const n of network.nodes) {
      if (openNodes.has(n.id) && closedNodes.has(n.id)) {
        pts.push(projector.latLngToSvg(n));
      }
    }
    return pts;
  }, [network, status, projector]);

  const userSvg = userPosition ? projector.latLngToSvg(userPosition) : null;
  const snappedSvg =
    navState && navState.isOffTrack
      ? projector.latLngToSvg(navState.snappedPoint)
      : null;

  const inverseScale = Math.min(1.15, Math.max(0.45, 1 / Math.sqrt(zoom)));
  const activeRoutePath = activeRoute
    ? coordsToSvgPath(activeRoute.polyline, projector.latLngToSvg)
    : '';

  return (
    <div
      ref={containerRef}
      className="map-stage"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      role="application"
      aria-label="Interactive Quogue Wildlife Refuge trail map"
    >
      <svg
        className="map-svg"
        width={viewportSize.width}
        height={viewportSize.height}
        viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}
      >
        <defs>
          {/* Pond water depth gradient */}
          <linearGradient id="pondGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#66BCE6" />
            <stop offset="55%" stopColor="#3590C6" />
            <stop offset="100%" stopColor="#2673A5" />
          </linearGradient>

          {/* Soft wetland reed pattern */}
          <pattern
            id="wetlandReeds"
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M4 13 L4 7 M7 13 L8.5 8 M13 15 L13 10 M2 13 L9 13"
              stroke="#5A9F93"
              strokeWidth="1"
              strokeLinecap="round"
              opacity="0.45"
            />
          </pattern>

          {/* Closed trail diagonal hatch */}
          <pattern
            id="closedHatch"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="10"
              stroke="#D9383A"
              strokeWidth="3"
              opacity="0.55"
            />
          </pattern>

          {/* Soft drop shadow for pins */}
          <filter id="pinShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="2.2"
              floodColor="#122E22"
              floodOpacity="0.26"
            />
          </filter>

          {/* Directional cone gradient for live compass */}
          <linearGradient id="coneGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#1D6FE2" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#1D6FE2" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Camera World Transform */}
        <g
          transform={`translate(${screenPivotX.toFixed(1)}, ${screenPivotY.toFixed(
            1
          )}) rotate(${(-mapRotationDeg).toFixed(1)}) scale(${effectiveScale.toFixed(
            4
          )}) translate(${(-camCenter.x).toFixed(1)}, ${(-camCenter.y).toFixed(1)})`}
        >
          {/* 1. Preserve Boundary Landmass */}
          <path
            d={coordsToSvgPath(network.boundaryPolygon, projector.latLngToSvg, true)}
            fill="#E7EFE0"
            stroke="#51735F"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />

          {/* Perimeter X-Fence subtle inner tick border */}
          <path
            d={coordsToSvgPath(network.boundaryPolygon, projector.latLngToSvg, true)}
            fill="none"
            stroke="#2F4F3E"
            strokeWidth={1.1}
            strokeDasharray="2 10"
            opacity={0.65}
          />

          {/* 2. Habitat Ecological Zones */}
          {network.habitats.map((hab) => {
            let fill = '#DFEAD6';
            let stroke = 'none';
            if (hab.kind === 'dwarf-pine-barrens') fill = '#E7EBD3';
            if (hab.kind === 'forest-regeneration') {
              fill = '#F5ECD1';
              stroke = '#D9C695';
            }
            if (hab.kind === 'swamp' || hab.kind === 'bog') {
              fill = '#D0E9E3';
            }
            if (hab.kind === 'field') {
              fill = '#EEF2D5';
            }
            const d = coordsToSvgPath(hab.coordinates, projector.latLngToSvg, true);
            return (
              <g key={hab.id}>
                <path
                  d={d}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={stroke === 'none' ? 0 : 1.3}
                  strokeDasharray={hab.kind === 'forest-regeneration' ? '4 4' : undefined}
                />
                {(hab.kind === 'swamp' || hab.kind === 'bog') && (
                  <path d={d} fill="url(#wetlandReeds)" />
                )}
              </g>
            );
          })}

          {/* 3. Illustrated Botanical Tree & Sprout Glyphs */}
          <g opacity={0.78}>
            {BOTANICAL_GLYPHS.map((g, idx) => {
              const pt = projector.latLngToSvg({ lat: g.lat, lng: g.lng });
              return (
                <g
                  key={idx}
                  transform={`translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(
                    1
                  )}) rotate(${mapRotationDeg.toFixed(1)}) scale(${g.scale})`}
                >
                  {g.kind === 'dwarf' && (
                    <g>
                      <path
                        d="M0 -8 L-5.5 -2 L-2.5 -2 L-6.5 3 L6.5 3 L2.5 -2 L5.5 -2 Z"
                        fill="#5E855B"
                      />
                      <rect x="-1.2" y="3" width="2.4" height="2.8" fill="#7D6249" />
                    </g>
                  )}
                  {g.kind === 'pine' && (
                    <g>
                      <path
                        d="M0 -13 L-5.5 -6 L-2.8 -6 L-7.5 0 L-3.5 0 L-8.5 6 L8.5 6 L3.5 0 L7.5 0 L2.8 -6 L5.5 -6 Z"
                        fill="#3F7852"
                      />
                      <rect x="-1.4" y="6" width="2.8" height="3.5" fill="#765B43" />
                    </g>
                  )}
                  {g.kind === 'oak' && (
                    <g>
                      <circle cx="-3.5" cy="-2" r="5" fill="#4E875B" />
                      <circle cx="3.5" cy="-1.5" r="4.8" fill="#3D744C" />
                      <circle cx="0" cy="-6" r="5.2" fill="#5D9468" />
                      <rect x="-1.5" y="2.5" width="3" height="4.8" fill="#765B43" />
                    </g>
                  )}
                  {g.kind === 'sprout' && (
                    <path
                      d="M0 4 L0 -2 M0 0 C-3 -2 -4.5 -4.5 -4 -5.5 C-1.5 -5 0 -3 0 -1 M0 1 C3 -1 4.5 -3.5 4 -4.5 C1.5 -4 0 -2 0 0"
                      fill="none"
                      stroke="#8B6B2E"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* 4. Creek & LIRR Railroad */}
          {network.decorLines.map((line) => {
            const d = coordsToSvgPath(line.coordinates, projector.latLngToSvg);
            if (line.kind === 'creek') {
              return (
                <path
                  key={line.id}
                  d={d}
                  fill="none"
                  stroke="#55A9D8"
                  strokeWidth={3.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.85}
                />
              );
            }
            if (line.kind === 'railroad') {
              return (
                <g key={line.id} opacity={0.75}>
                  <path d={d} fill="none" stroke="#6E655B" strokeWidth={2.2} />
                  <path
                    d={d}
                    fill="none"
                    stroke="#6E655B"
                    strokeWidth={7}
                    strokeDasharray="1.8 8.5"
                  />
                </g>
              );
            }
            return null;
          })}

          {/* 5. Luminous Ponds (Old Ice Pond, North Pond, Deer Pond) */}
          {network.waterBodies.map((wb) => {
            const d = coordsToSvgPath(wb.coordinates, projector.latLngToSvg, true);
            return (
              <g key={wb.id}>
                <path
                  d={d}
                  fill="url(#pondGrad)"
                  stroke="#B8E1F5"
                  strokeWidth={2.8}
                  strokeLinejoin="round"
                />
                <path
                  d={d}
                  fill="none"
                  stroke="#1E6A99"
                  strokeWidth={0.9}
                  opacity={0.45}
                />
              </g>
            );
          })}

          {/* Subtle Mossy Islands on Old Ice Pond (signature Refuge feature) */}
          {[
            { lat: 40.83575, lng: -72.61645, rx: 5, ry: 3.5 },
            { lat: 40.83515, lng: -72.61735, rx: 4.5, ry: 3 },
            { lat: 40.83615, lng: -72.61685, rx: 3.8, ry: 2.5 }
          ].map((isl, i) => {
            const pt = projector.latLngToSvg(isl);
            return (
              <ellipse
                key={i}
                cx={pt.x}
                cy={pt.y}
                rx={isl.rx}
                ry={isl.ry}
                fill="#7AA87E"
                stroke="#B8E1F5"
                strokeWidth="1"
                opacity="0.92"
              />
            );
          })}

          {/* 6. Base Trail Network (Open, New Trail, & Closed Corridors) */}
          {network.segments.map((seg) => {
            const d = coordsToSvgPath(seg.waypoints, projector.latLngToSvg);
            const open = isSegmentOpen(seg.id, status);
            if (!open) {
              return (
                <g key={seg.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke="#D9383A"
                    strokeWidth={15}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.22}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="url(#closedHatch)"
                    strokeWidth={13}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="#C92A2A"
                    strokeWidth={2.6}
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                  />
                </g>
              );
            }

            if (seg.isNewTrail) {
              return (
                <g key={seg.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke="#F7F4EC"
                    strokeWidth={6.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="#8A5628"
                    strokeWidth={3.6}
                    strokeDasharray="2 6"
                    strokeLinecap="round"
                  />
                </g>
              );
            }

            return (
              <g key={seg.id}>
                <path
                  d={d}
                  fill="none"
                  stroke="#F7F4EC"
                  strokeWidth={seg.surface === 'boardwalk' || seg.surface === 'bridge' ? 6.5 : 5.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.85}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={
                    seg.surface === 'boardwalk' || seg.surface === 'bridge'
                      ? '#9B6E43'
                      : '#B49E75'
                  }
                  strokeWidth={seg.surface === 'boardwalk' || seg.surface === 'bridge' ? 3.8 : 2.8}
                  strokeDasharray={seg.surface === 'boardwalk' ? '4 2.5' : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {/* Closed Trail Barrier Badges at Open-to-Closed Junctions */}
          {closedBarrierPoints.map((pt, idx) => (
            <g
              key={idx}
              transform={`translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(
                1
              )}) rotate(${mapRotationDeg.toFixed(1)}) scale(${inverseScale.toFixed(2)})`}
              filter="url(#pinShadow)"
            >
              <circle r="8.5" fill="#C92A2A" stroke="#FFFFFF" strokeWidth="2" />
              <path
                d="M-3.2 -3.2 L3.2 3.2 M3.2 -3.2 L-3.2 3.2"
                stroke="#FFFFFF"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </g>
          ))}

          {/* 7. Active Selected / Walking Route Highlight */}
          {activeRoute && activeRoutePath && (
            <g>
              {/* Soft outer sunlight glow */}
              <path
                d={activeRoutePath}
                fill="none"
                stroke={activeRoute.colorHex}
                strokeWidth={13}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.18}
              />
              {/* Crisp white road casing */}
              <path
                d={activeRoutePath}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={8.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Vivid route trail line */}
              <path
                d={activeRoutePath}
                fill="none"
                stroke={activeRoute.colorHex}
                strokeWidth={5.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Gentle flowing motion guide when walking */}
              {isNavigating && (
                <path
                  d={activeRoutePath}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={2.2}
                  strokeDasharray="6 14"
                  strokeLinecap="round"
                  opacity={0.78}
                  className="route-flow-dashes"
                />
              )}

              {/* Directional Chevron Arrows pointing along the walk */}
              {routeChevrons.map((ch, idx) => (
                <g
                  key={idx}
                  transform={`translate(${ch.x.toFixed(1)}, ${ch.y.toFixed(
                    1
                  )}) rotate(${ch.deg.toFixed(1)})`}
                >
                  <circle
                    r="6.2"
                    fill={activeRoute.colorHex}
                    stroke="#FFFFFF"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M-2.6 1.5 L0 -2.6 L2.6 1.5"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ))}
            </g>
          )}

          {/* 8. Water & Habitat Cartographic Labels (Always Counter-Rotated Upright!) */}
          <g pointerEvents="none">
            {network.waterBodies.map((wb) => {
              if (!wb.labelPosition) return null;
              const pt = projector.latLngToSvg(wb.labelPosition);
              return (
                <g
                  key={`lbl-${wb.id}`}
                  transform={`translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(
                    1
                  )}) rotate(${mapRotationDeg.toFixed(1)}) scale(${inverseScale.toFixed(2)})`}
                >
                  <text
                    textAnchor="middle"
                    y="4"
                    fontSize="11.5"
                    fontWeight="800"
                    letterSpacing="0.04em"
                    fill="#FFFFFF"
                    stroke="#1C5F8A"
                    strokeWidth="3.4"
                    paintOrder="stroke"
                  >
                    {wb.name.toUpperCase()}
                  </text>
                </g>
              );
            })}

            {/* Subtle Habitat Region Labels */}
            {[
              { label: 'DWARF PINE BARRENS', lat: 40.8470, lng: -72.6172 },
              { label: 'PINE BARRENS', lat: 40.8423, lng: -72.6181 },
              { label: 'FOREST REGENERATION', lat: 40.8386, lng: -72.6180 },
              { label: 'TRAILS CLOSED', lat: 40.8364, lng: -72.6194, isDanger: true },
              { label: 'BOG', lat: 40.8337, lng: -72.6177 },
              { label: 'FAIRY DELL', lat: 40.8318, lng: -72.6164 }
            ].map((h, idx) => {
              const hasClosed = Object.values(status.segments).some(
                (s) => s.status === 'closed'
              );
              if (h.isDanger && !hasClosed) return null;
              const pt = projector.latLngToSvg({ lat: h.lat, lng: h.lng });
              return (
                <g
                  key={idx}
                  transform={`translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(
                    1
                  )}) rotate(${mapRotationDeg.toFixed(1)}) scale(${inverseScale.toFixed(2)})`}
                >
                  <text
                    textAnchor="middle"
                    fontSize={h.isDanger ? '10' : '9.5'}
                    fontWeight="800"
                    letterSpacing="0.08em"
                    fill={h.isDanger ? '#B51F21' : '#4E6B58'}
                    stroke="#F7F4EC"
                    strokeWidth="3"
                    paintOrder="stroke"
                  >
                    {h.label}
                  </text>
                </g>
              );
            })}
          </g>

          {/* 9. Interactive Landmark & POI Pins */}
          {network.pois.map((poi) => {
            // Keep major pins clear and clutter-free; reveal dense southern hub details when zoomed in or selected
            const isSelected = selectedPoiIds.includes(poi.id);
            const isWaterPin =
              poi.id === 'old-ice-pond' ||
              poi.id === 'north-pond' ||
              poi.id === 'deer-pond';
            const isMajor =
              poi.id === 'parking' ||
              poi.id === 'the-bridge' ||
              poi.id === 'bluebird-nestboxes' ||
              poi.id === 'dwarf-pines' ||
              poi.id === 'fairy-dell';
            // Show water pins when selected or zoomed in close (water bodies already have bold cartographic labels)
            if (isWaterPin && !isSelected && zoom < 2.2) return null;
            if (!isMajor && !isWaterPin && !isSelected && zoom < 2.35) return null;

            const pt = projector.latLngToSvg({ lat: poi.lat, lng: poi.lng });
            const fill = poiPinFill(poi, isSelected);
            const stopNum = selectedPoiIds.indexOf(poi.id) + 1;

            return (
              <g
                key={poi.id}
                transform={`translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(
                  1
                )}) rotate(${mapRotationDeg.toFixed(1)}) scale(${inverseScale.toFixed(2)})`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPoi(poi);
                }}
              >
                <g filter="url(#pinShadow)">
                  <circle
                    r={isSelected ? 14 : 11.5}
                    fill={fill}
                    stroke="#FFFFFF"
                    strokeWidth="2.4"
                  />
                  {stopNum > 0 ? (
                    <text
                      x="0"
                      y="4.5"
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="800"
                      fill="#FFFFFF"
                    >
                      {stopNum}
                    </text>
                  ) : (
                    <PoiIconGlyph icon={poi.icon} />
                  )}
                </g>
                <text
                  y={isSelected ? 25 : 22}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="800"
                  fill="#16291F"
                  stroke="#FAF8F2"
                  strokeWidth="3.4"
                  paintOrder="stroke"
                >
                  {poi.shortName}
                </text>
              </g>
            );
          })}

          {/* 10. Off-Track Rejoin Dashed Tether */}
          {userSvg && snappedSvg && navState?.isOffTrack && (
            <g>
              <line
                x1={userSvg.x}
                y1={userSvg.y}
                x2={snappedSvg.x}
                y2={snappedSvg.y}
                stroke="#D9383A"
                strokeWidth={3.5}
                strokeDasharray="6 5"
                strokeLinecap="round"
              />
              <circle
                cx={snappedSvg.x}
                cy={snappedSvg.y}
                r="7"
                fill="#FFFFFF"
                stroke="#D9383A"
                strokeWidth="3"
              />
            </g>
          )}

          {/* 11. Live User GPS Dot + Heading Cone */}
          {userSvg && (
            <g transform={`translate(${userSvg.x.toFixed(1)}, ${userSvg.y.toFixed(1)})`}>
              {/* GPS Accuracy Radius Halo */}
              {accuracyMeters !== null && accuracyMeters > 4 && (
                <circle
                  r={Math.min(44, accuracyMeters / projector.metersPerSvgUnit)}
                  fill="#1D6FE2"
                  opacity={0.12}
                />
              )}
              {/* Directional Heading Cone */}
              {headingDeg !== null && (
                <g transform={`rotate(${headingDeg.toFixed(1)})`}>
                  <path
                    d="M0 0 L-22 -48 A52 52 0 0 1 22 -48 Z"
                    fill="url(#coneGrad)"
                  />
                </g>
              )}
              {/* Pulsing Ring */}
              <circle
                r={15 * inverseScale}
                fill={navState?.isOffTrack ? '#D9383A' : '#1D6FE2'}
                className="gps-pulse-ring"
              />
              {/* Crisp User Marker */}
              <circle
                r={10 * inverseScale}
                fill={navState?.isOffTrack ? '#D9383A' : '#1D6FE2'}
                stroke="#FFFFFF"
                strokeWidth={3 * inverseScale}
                filter="url(#pinShadow)"
              />
            </g>
          )}
        </g>
      </svg>

      {/* Right-Edge Floating Map Controls */}
      <div
        className={`map-controls ${
          isNavigating && navState?.isOffTrack ? 'off-track-shift' : ''
        }`}
      >
        <button
          type="button"
          className={`map-ctrl-btn ${followUser ? 'active' : ''}`}
          onClick={handleRecenter}
          aria-label="Center map on my location"
          title="Center map"
        >
          <LocateFixed size={22} />
        </button>

        <button
          type="button"
          className={`map-ctrl-btn ${headingUp ? 'active' : ''}`}
          onClick={onToggleHeadingUp}
          aria-label={headingUp ? 'Heading-up compass active' : 'North-up map'}
          title={headingUp ? 'Heading-Up Compass' : 'North-Up Map'}
        >
          <Compass
            size={22}
            style={{
              transform: `rotate(${-mapRotationDeg}deg)`,
              transition: 'transform 0.2s ease'
            }}
          />
        </button>

        <button
          type="button"
          className="map-ctrl-btn"
          onClick={() => setZoom((z) => Math.min(4.5, z * 1.28))}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus size={22} />
        </button>

        <button
          type="button"
          className="map-ctrl-btn"
          onClick={() => setZoom((z) => Math.max(0.72, z * 0.78))}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus size={22} />
        </button>

        <button
          type="button"
          className={`map-ctrl-btn ${legendOpen ? 'active' : ''}`}
          onClick={() => setLegendOpen((o) => !o)}
          aria-label="Toggle map legend"
          title="Map Legend"
        >
          <Layers size={20} />
        </button>
      </div>

      {/* Compact Sunlit Field Guide Legend Popover */}
      {legendOpen && (
        <div className="legend-popover" role="region" aria-label="Map Legend">
          <h3>Trail Map Key</h3>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: '#1E8E4E' }} />
            <span>Green Loop · 0.8 mi</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: '#C28500' }} />
            <span>Yellow Loop · 1.4 mi</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: '#1D5FD6' }} />
            <span>Blue Loop · 2.5 mi</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: '#C62828' }} />
            <span>Red Loop · 3.1 mi</span>
          </div>
          <div className="legend-row">
            <span
              className="legend-swatch"
              style={{
                background: 'repeating-linear-gradient(90deg,#8A5628 0 5px,transparent 5px 9px)'
              }}
            />
            <span>New Trail (Bluebirds)</span>
          </div>
          <div className="legend-row">
            <span
              className="legend-swatch"
              style={{
                background:
                  'repeating-linear-gradient(45deg,#D9383A 0 4px,#FAD4D4 4px 8px)'
              }}
            />
            <span>Trails Closed (Tree Work)</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: '#3590C6' }} />
            <span>Ponds &amp; Quantuck Creek</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: '#CFE8E2' }} />
            <span>Bog &amp; Swamp Wetlands</span>
          </div>
        </div>
      )}
    </div>
  );
};
