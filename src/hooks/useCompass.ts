import { useCallback, useEffect, useRef, useState } from 'react';
import { angleDelta, normalizeAngle } from '../engine/geo';

interface DeviceOrientationEventiOS extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

interface DeviceOrientationStaticiOS {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export interface CompassState {
  headingDeg: number | null;
  supported: boolean;
  permissionNeeded: boolean;
  requestCompassPermission: () => Promise<void>;
}

function getScreenOrientationAngle(): number {
  if (typeof window === 'undefined') return 0;
  if (window.screen?.orientation && typeof window.screen.orientation.angle === 'number') {
    return window.screen.orientation.angle;
  }
  const legacyAngle = (window as unknown as { orientation?: number }).orientation;
  return typeof legacyAngle === 'number' ? legacyAngle : 0;
}

/**
 * Provides smoothed true-north device compass heading (0 = North, 90 = East)
 * using iOS webkitCompassHeading and Android deviceorientationabsolute,
 * falling back to GPS course-over-ground when magnetometer data is unavailable.
 */
export function useCompass(
  fallbackHeadingDeg: number | null,
  preferFallback = false
): CompassState {
  const [sensorHeading, setSensorHeading] = useState<number | null>(null);
  const [supported, setSupported] = useState(false);
  const [permissionNeeded, setPermissionNeeded] = useState(false);
  const smoothedRef = useRef<number | null>(null);
  const hasAbsoluteRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      return;
    }
    setSupported(true);

    const doeStatic =
      window.DeviceOrientationEvent as unknown as DeviceOrientationStaticiOS;
    if (typeof doeStatic?.requestPermission === 'function') {
      setPermissionNeeded(true);
    }

    const applyHeading = (raw: number) => {
      const adjusted = normalizeAngle(raw + getScreenOrientationAngle());
      if (smoothedRef.current === null) {
        smoothedRef.current = adjusted;
      } else {
        const delta = angleDelta(smoothedRef.current, adjusted);
        smoothedRef.current = normalizeAngle(smoothedRef.current + delta * 0.22);
      }
      setSensorHeading(Math.round(smoothedRef.current));
    };

    const handleAbsolute = (evt: Event) => {
      const e = evt as DeviceOrientationEventiOS;
      if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
        hasAbsoluteRef.current = true;
        applyHeading(normalizeAngle(360 - e.alpha));
      }
    };

    const handleOrientation = (evt: Event) => {
      const e = evt as DeviceOrientationEventiOS;
      // iOS Safari provides true-north magnetic heading directly
      if (
        typeof e.webkitCompassHeading === 'number' &&
        !Number.isNaN(e.webkitCompassHeading) &&
        (e.webkitCompassAccuracy === undefined || e.webkitCompassAccuracy >= 0)
      ) {
        applyHeading(e.webkitCompassHeading);
        return;
      }
      // On Android, only fall back to standard deviceorientation if it explicitly reports absolute North
      if (!hasAbsoluteRef.current && e.absolute === true && typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
        applyHeading(normalizeAngle(360 - e.alpha));
      }
    };

    window.addEventListener('deviceorientationabsolute', handleAbsolute, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleAbsolute, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, []);

  const requestCompassPermission = useCallback(async () => {
    const doeStatic =
      window.DeviceOrientationEvent as unknown as DeviceOrientationStaticiOS;
    if (typeof doeStatic?.requestPermission === 'function') {
      try {
        const res = await doeStatic.requestPermission();
        if (res === 'granted') {
          setPermissionNeeded(false);
        }
      } catch {
        // User dismissed or non-HTTPS
      }
    }
  }, []);

  // In production GPS walks, prefer live magnetometer compass so turning at junctions rotates immediately,
  // falling back to GPS course-over-ground. In simulator mode, prefer simulated travel bearing.
  const headingDeg = preferFallback
    ? (fallbackHeadingDeg ?? sensorHeading)
    : (sensorHeading ?? fallbackHeadingDeg);

  return {
    headingDeg,
    supported,
    permissionNeeded,
    requestCompassPermission
  };
}
