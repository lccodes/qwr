import { useEffect, useState } from 'react';
import type { TrailNetwork, TrailStatusConfig } from '../types';

const STATUS_CACHE_KEY = 'qwr_trail_status_cache_v1';

export interface TrailDataState {
  network: TrailNetwork | null;
  status: TrailStatusConfig | null;
  loading: boolean;
  error: string | null;
  isOffline: boolean;
  offlineReady: boolean;
}

export function useTrailData(): TrailDataState {
  const [network, setNetwork] = useState<TrailNetwork | null>(null);
  const [status, setStatus] = useState<TrailStatusConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Check if Service Worker is controlling the page for offline confidence
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => setOfflineReady(true))
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const netRes = await fetch('./data/trail-network.json');
        if (!netRes.ok) throw new Error('Could not load trail map geometry.');
        const netJson: TrailNetwork = await netRes.json();

        let statusJson: TrailStatusConfig | null = null;
        try {
          const stRes = await fetch('./data/trail-status.json', {
            cache: 'no-cache'
          });
          if (stRes.ok) {
            statusJson = await stRes.json();
            try {
              localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(statusJson));
            } catch {
              // ignore storage quota errors
            }
          }
        } catch {
          // Offline fallback to localStorage or cached fetch
          try {
            const cached = localStorage.getItem(STATUS_CACHE_KEY);
            if (cached) statusJson = JSON.parse(cached);
          } catch {
            // ignore
          }
          if (!statusJson) {
            const fallbackRes = await fetch('./data/trail-status.json');
            if (fallbackRes.ok) statusJson = await fallbackRes.json();
          }
        }

        if (!statusJson) {
          statusJson = {
            schemaVersion: '1.0',
            lastUpdated: '2025-12-01',
            refugePhone: '631-653-4771',
            facilities: {},
            segments: {}
          };
        }

        if (!cancelled) {
          setNetwork(netJson);
          setStatus(statusJson);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Unable to load Refuge map.'
          );
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { network, status, loading, error, isOffline, offlineReady };
}
