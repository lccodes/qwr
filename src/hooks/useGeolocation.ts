import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng, ResolvedRoute } from '../types';
import {
  distanceMeters,
  interpolateAlongPolyline,
  offsetLatLng
} from '../engine/geo';

const REFUGE_CENTER: LatLng = { lat: 40.8405, lng: -72.6166 };
const PARKING_COORD: LatLng = { lat: 40.83454, lng: -72.61528 };
const AWAY_THRESHOLD_METERS = 3200; // ~2 miles

export interface GeoHookState {
  position: LatLng | null;
  accuracyMeters: number | null;
  gpsHeadingDeg: number | null;
  gpsStatus: 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable';
  isAwayFromRefuge: boolean;
  /** Virtual walk simulator controls */
  simEnabled: boolean;
  simPlaying: boolean;
  simSpeed: 1 | 3 | 8;
  simProgress: number;
  simOffTrack: boolean;
  simTapToMove: boolean;
  startLiveGps: () => void;
  enableSimulator: (autoPlay?: boolean) => void;
  disableSimulator: () => void;
  setSimPlaying: (playing: boolean) => void;
  setSimSpeed: (speed: 1 | 3 | 8) => void;
  setSimProgress: (ratio: number) => void;
  toggleSimOffTrack: () => void;
  setSimTapToMove: (enabled: boolean) => void;
  teleportSimPosition: (coord: LatLng) => void;
}

export function useGeolocation(activeRoute: ResolvedRoute | null): GeoHookState {
  const [livePos, setLivePos] = useState<LatLng | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [liveHeading, setLiveHeading] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GeoHookState['gpsStatus']>('idle');
  const [isAwayFromRefuge, setIsAwayFromRefuge] = useState(false);

  const [simEnabled, setSimEnabled] = useState(false);
  const [simPlaying, setSimPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState<1 | 3 | 8>(3);
  const [simProgress, setSimProgress] = useState(0);
  const [simOffTrack, setSimOffTrack] = useState(false);
  const [simTapToMove, setSimTapToMove] = useState(false);
  const [simCustomPos, setSimCustomPos] = useState<LatLng | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const simMetersRef = useRef(0);
  const activeRouteIdRef = useRef<string | null>(null);

  // Reset simulator distance when switching to a brand new route
  useEffect(() => {
    if (activeRoute && activeRoute.id !== activeRouteIdRef.current) {
      activeRouteIdRef.current = activeRoute.id;
      simMetersRef.current = 0;
      setSimProgress(0);
      setSimOffTrack(false);
      setSimCustomPos(null);
    }
  }, [activeRoute]);

  const startLiveGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('unavailable');
      return;
    }
    if (watchIdRef.current !== null) return;

    setGpsStatus('requesting');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next: LatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        setLivePos(next);
        setAccuracyMeters(Math.round(pos.coords.accuracy));
        if (
          typeof pos.coords.heading === 'number' &&
          !Number.isNaN(pos.coords.heading) &&
          pos.coords.speed !== null &&
          pos.coords.speed > 0.3
        ) {
          setLiveHeading(pos.coords.heading);
        }
        setGpsStatus('active');
        const distFromQwr = distanceMeters(next, REFUGE_CENTER);
        setIsAwayFromRefuge(distFromQwr > AWAY_THRESHOLD_METERS);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('denied');
        } else {
          setGpsStatus('unavailable');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 12000
      }
    );
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Animate simulated hiker smoothly at 20 fps when playing
  useEffect(() => {
    if (!simEnabled || !simPlaying || !activeRoute) return;
    setSimCustomPos(null);

    const tickMs = 100;
    const baseMetersPerSec = 1.15; // gentle ~2.5 mph walk
    const timer = window.setInterval(() => {
      const total = Math.max(1, activeRoute.distanceMeters);
      simMetersRef.current += (baseMetersPerSec * simSpeed * tickMs) / 1000;
      if (simMetersRef.current >= total) {
        simMetersRef.current = total;
        setSimProgress(1);
        setSimPlaying(false);
        return;
      }
      setSimProgress(simMetersRef.current / total);
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [simEnabled, simPlaying, simSpeed, activeRoute]);

  const enableSimulator = useCallback((autoPlay = true) => {
    setSimEnabled(true);
    setSimCustomPos(null);
    setSimOffTrack(false);
    setSimPlaying(autoPlay);
  }, []);

  const disableSimulator = useCallback(() => {
    setSimEnabled(false);
    setSimPlaying(false);
    setSimOffTrack(false);
    setSimTapToMove(false);
    setSimCustomPos(null);
  }, []);

  const handleSetSimProgress = useCallback(
    (ratio: number) => {
      const clamped = Math.max(0, Math.min(1, ratio));
      setSimProgress(clamped);
      setSimCustomPos(null);
      if (activeRoute) {
        simMetersRef.current = clamped * activeRoute.distanceMeters;
      }
    },
    [activeRoute]
  );

  const toggleSimOffTrack = useCallback(() => {
    setSimCustomPos(null);
    setSimOffTrack((prev) => !prev);
  }, []);

  const teleportSimPosition = useCallback((coord: LatLng) => {
    setSimEnabled(true);
    setSimPlaying(false);
    setSimOffTrack(false);
    setSimCustomPos(coord);
  }, []);

  // Resolve effective position + heading
  let position: LatLng | null = livePos;
  let gpsHeadingDeg: number | null = liveHeading;
  let effectiveAccuracy = accuracyMeters;

  if (simEnabled) {
    effectiveAccuracy = 5;
    if (simCustomPos) {
      position = simCustomPos;
      gpsHeadingDeg = 0;
    } else if (activeRoute && activeRoute.polyline.length >= 2) {
      const sample = interpolateAlongPolyline(
        activeRoute.polyline,
        simProgress * activeRoute.distanceMeters
      );
      gpsHeadingDeg = sample.bearingDeg;
      if (simOffTrack) {
        // Step 35m perpendicular to the right of travel direction so off-track always fires cleanly
        const perpRad = ((sample.bearingDeg + 90) * Math.PI) / 180;
        const northM = 35 * Math.cos(perpRad);
        const eastM = 35 * Math.sin(perpRad);
        position = offsetLatLng(sample.point, northM, eastM);
      } else {
        position = sample.point;
      }
    } else {
      position = PARKING_COORD;
      gpsHeadingDeg = 0;
    }
  }

  return {
    position,
    accuracyMeters: effectiveAccuracy,
    gpsHeadingDeg,
    gpsStatus,
    isAwayFromRefuge,
    simEnabled,
    simPlaying,
    simSpeed,
    simProgress,
    simOffTrack,
    simTapToMove,
    startLiveGps,
    enableSimulator,
    disableSimulator,
    setSimPlaying,
    setSimSpeed,
    setSimProgress: handleSetSimProgress,
    toggleSimOffTrack,
    setSimTapToMove,
    teleportSimPosition
  };
}
