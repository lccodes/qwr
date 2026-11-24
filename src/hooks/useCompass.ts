import { useCallback, useEffect, useRef, useState } from 'react';
import { angleDelta, normalizeAngle } from '../engine/geo';

interface DeviceOrientationEventiOS extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
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

/**
 * Provides smoothed device compass heading (0 = North, 90 = East) with
 * iOS 13+ permission handling and graceful fallback to GPS/simulated heading.
 */
export function useCompass(fallbackHeadingDeg: number | null): CompassState {
  const [sensorHeading, setSensorHeading] = useState<number | null>(null);
  const [supported, setSupported] = useState(false);
  const [permissionNeeded, setPermissionNeeded] = useState(false);
  const smoothedRef = useRef<number | null>(null);

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

    const handleOrientation = (evt: Event) => {
      const e = evt as DeviceOrientationEventiOS;
      let raw: number | null = null;
      if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
        raw = e.webkitCompassHeading;
      } else if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
        raw = normalizeAngle(360 - e.alpha);
      }

      if (raw === null) return;
      if (smoothedRef.current === null) {
        smoothedRef.current = raw;
      } else {
        const delta = angleDelta(smoothedRef.current, raw);
        smoothedRef.current = normalizeAngle(smoothedRef.current + delta * 0.22);
      }
      setSensorHeading(Math.round(smoothedRef.current));
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
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

  // Prefer live fallback when in simulator or walking; otherwise live compass sensor
  const headingDeg = fallbackHeadingDeg ?? sensorHeading;

  return {
    headingDeg,
    supported,
    permissionNeeded,
    requestCompassPermission
  };
}
