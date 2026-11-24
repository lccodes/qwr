import { useEffect, useRef } from 'react';

/**
 * Keeps the visitor's mobile screen awake during active trail navigation
 * using the Screen Wake Lock API (with safe graceful fallback where unsupported).
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (
      !active ||
      typeof navigator === 'undefined' ||
      !('wakeLock' in navigator) ||
      !navigator.wakeLock
    ) {
      if (sentinelRef.current && !sentinelRef.current.released) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinelRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // Ignore battery-saver or unsupported browser rejections
      }
    };

    acquire();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinelRef.current && !sentinelRef.current.released) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
    };
  }, [active]);
}
