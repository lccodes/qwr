import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng, ResolvedRoute } from '../types';
import {
  bearingDeg,
  distanceMeters,
  interpolateAlongPolyline,
  offsetLatLng
} from '../engine/geo';

const REFUGE_CENTER: LatLng = { lat: 40.8405, lng: -72.6166 };
const PARKING_COORD: LatLng = { lat: 40.83454, lng: -72.61528 };
/** Consider visitor "on-site / nearby" within ~2 miles (3.2 km) of QWR center */
const AWAY_THRESHOLD_METERS = 3200;
/** Reject noisy cell-tower outlier jumps once we hold an accurate GPS fix */
const GOOD_FIX_ACCURACY_M = 35;
const OUTLIER_ACCURACY_M = 65;
const RECENT_FIX_WINDOW_MS = 30000;
/** Minimum real walking movement to derive course-over-ground heading */
const MIN_HEADING_STEP_METERS = 3.5;

export interface GeoHookState {
  position: LatLng | null;
  accuracyMeters: number | null;
  gpsHeadingDeg: number | null;
  gpsStatus: 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable';
  isAwayFromRefuge: boolean;
  distanceFromRefugeMeters: number | null;
  /** Virtual walk simulator controls (active only when feature flag is enabled) */
  simEnabled: boolean;
  simPlaying: boolean;
  simSpeed: 1 | 3 | 8;
  simProgress: number;
  simOffTrack: boolean;
  simTapToMove: boolean;
  startLiveGps: (forceRestart?: boolean) => void;
  enableSimulator: (autoPlay?: boolean) => void;
  disableSimulator: () => void;
  setSimPlaying: (playing: boolean) => void;
  setSimSpeed: (speed: 1 | 3 | 8) => void;
  setSimProgress: (ratio: number) => void;
  toggleSimOffTrack: () => void;
  setSimTapToMove: (enabled: boolean) => void;
  teleportSimPosition: (coord: LatLng) => void;
}

export function useGeolocation(
  activeRoute: ResolvedRoute | null,
  allowSimulator: boolean
): GeoHookState {
  const [livePos, setLivePos] = useState<LatLng | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [liveHeading, setLiveHeading] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GeoHookState['gpsStatus']>('idle');
  const [isAwayFromRefuge, setIsAwayFromRefuge] = useState(false);
  const [distanceFromRefugeMeters, setDistanceFromRefugeMeters] = useState<
    number | null
  >(null);

  const [simEnabled, setSimEnabled] = useState(false);
  const [simPlaying, setSimPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState<1 | 3 | 8>(3);
  const [simProgress, setSimProgress] = useState(0);
  const [simOffTrack, setSimOffTrack] = useState(false);
  const [simTapToMove, setSimTapToMove] = useState(false);
  const [simCustomPos, setSimCustomPos] = useState<LatLng | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastGoodFixRef = useRef<{
    pos: LatLng;
    accuracy: number;
    time: number;
  } | null>(null);
  const lastHeadingAnchorRef = useRef<LatLng | null>(null);
  const simMetersRef = useRef(0);
  const activeRouteIdRef = useRef<string | null>(null);

  // Reset simulator distance when switching routes
  useEffect(() => {
    if (activeRoute && activeRoute.id !== activeRouteIdRef.current) {
      activeRouteIdRef.current = activeRoute.id;
      simMetersRef.current = 0;
      setSimProgress(0);
      setSimOffTrack(false);
      setSimCustomPos(null);
    }
  }, [activeRoute]);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startLiveGps = useCallback(
    (forceRestart = false) => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        setGpsStatus('unavailable');
        return;
      }
      if (forceRestart) {
        stopWatch();
      } else if (watchIdRef.current !== null) {
        return;
      }

      setGpsStatus((prev) => (prev === 'active' ? 'active' : 'requesting'));

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const raw: LatLng = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          const acc = pos.coords.accuracy;
          const now = Date.now();

          // Ignore sudden low-accuracy cell-tower outliers when we already have a crisp GPS fix
          const prevGood = lastGoodFixRef.current;
          if (
            prevGood &&
            prevGood.accuracy <= GOOD_FIX_ACCURACY_M &&
            acc > OUTLIER_ACCURACY_M &&
            now - prevGood.time < RECENT_FIX_WINDOW_MS
          ) {
            return;
          }

          // Light exponential smoothing on small walking updates to calm canopy jitter
          let smoothed = raw;
          if (prevGood && now - prevGood.time < 10000) {
            const jumpM = distanceMeters(prevGood.pos, raw);
            if (jumpM < 30) {
              const alpha = jumpM < 2.5 ? 0.35 : 0.65;
              smoothed = {
                lat: prevGood.pos.lat + (raw.lat - prevGood.pos.lat) * alpha,
                lng: prevGood.pos.lng + (raw.lng - prevGood.pos.lng) * alpha
              };
            }
          }

          lastGoodFixRef.current = { pos: smoothed, accuracy: acc, time: now };
          setLivePos(smoothed);
          setAccuracyMeters(Math.round(acc));
          setGpsStatus('active');

          const distFromQwr = distanceMeters(smoothed, REFUGE_CENTER);
          setDistanceFromRefugeMeters(distFromQwr);
          setIsAwayFromRefuge(distFromQwr > AWAY_THRESHOLD_METERS);

          // Use native browser heading when moving, or derive course-over-ground from consecutive fixes
          if (
            typeof pos.coords.heading === 'number' &&
            !Number.isNaN(pos.coords.heading) &&
            pos.coords.speed !== null &&
            pos.coords.speed > 0.35
          ) {
            setLiveHeading(pos.coords.heading);
            lastHeadingAnchorRef.current = smoothed;
          } else if (!lastHeadingAnchorRef.current) {
            lastHeadingAnchorRef.current = smoothed;
          } else {
            const stepM = distanceMeters(lastHeadingAnchorRef.current, smoothed);
            if (stepM >= MIN_HEADING_STEP_METERS) {
              setLiveHeading(bearingDeg(lastHeadingAnchorRef.current, smoothed));
              lastHeadingAnchorRef.current = smoothed;
            }
          }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            stopWatch();
            setGpsStatus('denied');
          } else if (err.code === err.TIMEOUT) {
            // Keep watchPosition alive while satellites lock under forest canopy
            if (!lastGoodFixRef.current) {
              setGpsStatus('requesting');
            }
          } else {
            // Transient POSITION_UNAVAILABLE (e.g. dense pine canopy): keep watchPosition alive!
            if (!lastGoodFixRef.current) {
              setGpsStatus('unavailable');
            }
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 20000
        }
      );
    },
    [stopWatch]
  );

  // Auto-start GPS silently ONLY if the browser already granted geolocation permission,
  // avoiding a jarring cold permission popup before a first-time visitor taps Start or Locate.
  useEffect(() => {
    let active = true;
    if (
      typeof navigator !== 'undefined' &&
      'permissions' in navigator &&
      typeof navigator.permissions.query === 'function'
    ) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((perm) => {
          if (!active) return;
          if (perm.state === 'granted') {
            startLiveGps();
          } else if (perm.state === 'denied') {
            setGpsStatus('denied');
          }
        })
        .catch(() => {
          // Safari / browsers without geolocation permission query will prompt on user tap
        });
    }
    return () => {
      active = false;
      stopWatch();
    };
  }, [startLiveGps, stopWatch]);

  // Animate simulated hiker only when feature flag & simulator are both enabled
  useEffect(() => {
    if (!allowSimulator || !simEnabled || !simPlaying || !activeRoute) return;
    setSimCustomPos(null);

    const tickMs = 100;
    const baseMetersPerSec = 1.15;
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
  }, [allowSimulator, simEnabled, simPlaying, simSpeed, activeRoute]);

  const enableSimulator = useCallback(
    (autoPlay = true) => {
      if (!allowSimulator) return;
      setSimEnabled(true);
      setSimCustomPos(null);
      setSimOffTrack(false);
      setSimPlaying(autoPlay);
    },
    [allowSimulator]
  );

  const disableSimulator = useCallback(() => {
    setSimEnabled(false);
    setSimPlaying(false);
    setSimOffTrack(false);
    setSimTapToMove(false);
    setSimCustomPos(null);
  }, []);

  const handleSetSimProgress = useCallback(
    (ratio: number) => {
      if (!allowSimulator) return;
      const clamped = Math.max(0, Math.min(1, ratio));
      setSimProgress(clamped);
      setSimCustomPos(null);
      if (activeRoute) {
        simMetersRef.current = clamped * activeRoute.distanceMeters;
      }
    },
    [allowSimulator, activeRoute]
  );

  const toggleSimOffTrack = useCallback(() => {
    if (!allowSimulator) return;
    setSimCustomPos(null);
    setSimOffTrack((prev) => !prev);
  }, [allowSimulator]);

  const teleportSimPosition = useCallback(
    (coord: LatLng) => {
      if (!allowSimulator) return;
      setSimEnabled(true);
      setSimPlaying(false);
      setSimOffTrack(false);
      setSimCustomPos(coord);
    },
    [allowSimulator]
  );

  // Resolve effective position + heading
  const activeSim = allowSimulator && simEnabled;
  let position: LatLng | null = livePos;
  let gpsHeadingDeg: number | null = liveHeading;
  let effectiveAccuracy = accuracyMeters;
  let effectiveAway = isAwayFromRefuge;

  if (activeSim) {
    effectiveAccuracy = 5;
    effectiveAway = false;
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
    isAwayFromRefuge: effectiveAway,
    distanceFromRefugeMeters: activeSim ? 0 : distanceFromRefugeMeters,
    simEnabled: activeSim,
    simPlaying: activeSim && simPlaying,
    simSpeed,
    simProgress,
    simOffTrack: activeSim && simOffTrack,
    simTapToMove: activeSim && simTapToMove,
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
