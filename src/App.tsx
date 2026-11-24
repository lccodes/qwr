import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PoiDef, ResolvedRoute } from './types';
import {
  buildCustomWalk,
  resolveStandardLoop,
  routeBackToParking
} from './engine/router';
import { evaluateNavigation } from './engine/navigation';
import { getRefugeSunsetInfo } from './engine/sunset';
import { useTrailData } from './hooks/useTrailData';
import { useGeolocation } from './hooks/useGeolocation';
import { useCompass } from './hooks/useCompass';
import { useGuidanceCues } from './hooks/useGuidanceCues';
import { RefugeMap } from './components/RefugeMap';
import { TopHud } from './components/TopHud';
import { BottomSheet } from './components/BottomSheet';
import { PoiModal } from './components/PoiModal';
import { SafetyDrawer } from './components/SafetyDrawer';
import { SimulatorBar } from './components/SimulatorBar';

export const App: React.FC = () => {
  const { network, status, loading, error, isOffline, offlineReady } =
    useTrailData();

  const [mode, setMode] = useState<'standard' | 'custom'>('standard');
  const [selectedLoopId, setSelectedLoopId] = useState<string>('green-08');
  const [selectedPoiIds, setSelectedPoiIds] = useState<string[]>([]);
  const [returnRouteOverride, setReturnRouteOverride] =
    useState<ResolvedRoute | null>(null);

  const [isNavigating, setIsNavigating] = useState(false);
  const [headingUp, setHeadingUp] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [focusedPoi, setFocusedPoi] = useState<PoiDef | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [nowTick, setNowTick] = useState(() => new Date());

  // Refresh offline solar sunset indicator every minute
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const sunsetInfo = useMemo(() => getRefugeSunsetInfo(nowTick), [nowTick]);

  // Pre-resolve all 4 standard loops with automatic closure detouring
  const resolvedStandardLoops = useMemo(() => {
    if (!network || !status) return {};
    const out: Record<string, ResolvedRoute | null> = {};
    for (const loop of network.standardLoops) {
      out[loop.id] = resolveStandardLoop(network, status, loop.id);
    }
    return out;
  }, [network, status]);

  const customRoute = useMemo(() => {
    if (!network || !status || selectedPoiIds.length === 0) return null;
    return buildCustomWalk(network, status, selectedPoiIds, 'parking', 'parking');
  }, [network, status, selectedPoiIds]);

  const activeRoute: ResolvedRoute | null = useMemo(() => {
    if (returnRouteOverride) return returnRouteOverride;
    if (mode === 'standard') {
      return resolvedStandardLoops[selectedLoopId] ?? null;
    }
    return customRoute;
  }, [
    returnRouteOverride,
    mode,
    resolvedStandardLoops,
    selectedLoopId,
    customRoute
  ]);

  const geo = useGeolocation(activeRoute);
  const compass = useCompass(geo.gpsHeadingDeg);

  // Start passive GPS lock shortly after load so geofence & position are ready
  useEffect(() => {
    if (network) {
      geo.startLiveGps();
    }
  }, [network, geo.startLiveGps]);

  // Evaluate live turn-by-turn & off-track state with hysteresis
  const wasOffTrackRef = useRef(false);
  const navState = useMemo(() => {
    if (!isNavigating || !activeRoute || !geo.position) {
      wasOffTrackRef.current = false;
      return null;
    }
    const next = evaluateNavigation(
      geo.position,
      compass.headingDeg,
      activeRoute,
      wasOffTrackRef.current
    );
    wasOffTrackRef.current = next.isOffTrack;
    return next;
  }, [isNavigating, activeRoute, geo.position, compass.headingDeg]);

  useGuidanceCues(navState, isNavigating, voiceEnabled);

  const selectablePois = useMemo(
    () => (network ? network.pois.filter((p) => p.selectableForCustomWalk) : []),
    [network]
  );

  const handleTogglePoiStop = useCallback((poiId: string) => {
    setReturnRouteOverride(null);
    setSelectedPoiIds((prev) =>
      prev.includes(poiId)
        ? prev.filter((id) => id !== poiId)
        : [...prev, poiId]
    );
  }, []);

  const handleStartWalk = useCallback(
    async (useSimulator: boolean) => {
      if (!activeRoute) return;
      await compass.requestCompassPermission();
      if (useSimulator) {
        geo.enableSimulator(true);
      } else {
        geo.disableSimulator();
        geo.startLiveGps();
        // If user is clearly away from QWR or GPS unavailable, smoothly launch simulator
        if (geo.isAwayFromRefuge || geo.gpsStatus === 'unavailable' || geo.gpsStatus === 'denied') {
          geo.enableSimulator(true);
        }
      }
      setHeadingUp(true);
      setIsNavigating(true);
    },
    [activeRoute, compass, geo]
  );

  const handleEndWalk = useCallback(() => {
    setIsNavigating(false);
    setReturnRouteOverride(null);
    geo.setSimPlaying(false);
  }, [geo]);

  const handleBackToParking = useCallback(() => {
    if (!network || !status) return;
    const fromCoord =
      geo.position ??
      activeRoute?.polyline[Math.floor((activeRoute.polyline.length || 1) / 2)] ?? {
        lat: 40.8402,
        lng: -72.6155
      };
    const rescue = routeBackToParking(network, status, fromCoord);
    if (!rescue) return;
    setReturnRouteOverride(rescue);
    setIsNavigating(true);
    setHeadingUp(true);
    if (geo.simEnabled) {
      geo.setSimProgress(0);
      geo.setSimPlaying(true);
    }
  }, [network, status, geo, activeRoute]);

  const handleWalkToPoiFromModal = useCallback(
    (poi: PoiDef) => {
      setFocusedPoi(null);
      setReturnRouteOverride(null);
      setMode('custom');
      setSelectedPoiIds([poi.id]);
    },
    []
  );

  const handleStartVirtualWalkQuick = useCallback(() => {
    if (!activeRoute) {
      setMode('standard');
      setSelectedLoopId('yellow-14');
    }
    geo.enableSimulator(true);
    setHeadingUp(true);
    setIsNavigating(true);
  }, [activeRoute, geo]);

  const handleCycleSpeed = useCallback(() => {
    const next: 1 | 3 | 8 =
      geo.simSpeed === 1 ? 3 : geo.simSpeed === 3 ? 8 : 1;
    geo.setSimSpeed(next);
  }, [geo]);

  if (loading) {
    return (
      <div
        className="app-shell"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: 24,
          textAlign: 'center'
        }}
      >
        <img
          src="./icons/qwr-icon.svg"
          alt="Quogue Wildlife Refuge"
          style={{ width: 68, height: 68, borderRadius: 20 }}
        />
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--qwr-pine)'
          }}
        >
          Loading Quogue Wildlife Refuge Map…
        </div>
      </div>
    );
  }

  if (error || !network || !status) {
    return (
      <div
        className="app-shell"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
          gap: 12
        }}
      >
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--qwr-pine)' }}>
          Quogue Wildlife Refuge
        </h1>
        <p>{error ?? 'Unable to load offline map data.'}</p>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <RefugeMap
        network={network}
        status={status}
        activeRoute={activeRoute}
        selectedPoiIds={mode === 'custom' ? selectedPoiIds : []}
        isNavigating={isNavigating}
        userPosition={geo.position}
        accuracyMeters={geo.accuracyMeters}
        headingDeg={compass.headingDeg}
        navState={navState}
        headingUp={headingUp}
        onToggleHeadingUp={async () => {
          await compass.requestCompassPermission();
          setHeadingUp((h) => !h);
        }}
        onSelectPoi={(poi) => setFocusedPoi(poi)}
        simTapToMove={geo.simTapToMove}
        onMapTeleport={(coord) => {
          geo.teleportSimPosition(coord);
          if (!isNavigating && activeRoute) {
            setIsNavigating(true);
          }
        }}
      />

      <TopHud
        isNavigating={isNavigating}
        navState={navState}
        sunsetInfo={sunsetInfo}
        statusConfig={status}
        isOffline={isOffline}
        offlineReady={offlineReady}
        isAwayFromRefuge={geo.isAwayFromRefuge}
        simEnabled={geo.simEnabled}
        onOpenSafety={() => setSafetyOpen(true)}
        onStartVirtualWalk={handleStartVirtualWalkQuick}
        onRerouteBackToParking={handleBackToParking}
      />

      <div className="bottom-sheet-wrap">
        {geo.simEnabled && (
          <SimulatorBar
            playing={geo.simPlaying}
            speed={geo.simSpeed}
            progress={geo.simProgress}
            offTrack={geo.simOffTrack}
            tapToMove={geo.simTapToMove}
            onTogglePlay={() => geo.setSimPlaying(!geo.simPlaying)}
            onCycleSpeed={handleCycleSpeed}
            onScrubProgress={geo.setSimProgress}
            onToggleOffTrack={geo.toggleSimOffTrack}
            onToggleTapToMove={() => geo.setSimTapToMove(!geo.simTapToMove)}
            onClose={geo.disableSimulator}
          />
        )}

        <BottomSheet
          mode={mode}
          onModeChange={(nextMode) => {
            setReturnRouteOverride(null);
            setMode(nextMode);
          }}
          standardLoops={network.standardLoops}
          resolvedStandardLoops={resolvedStandardLoops}
          selectedLoopId={selectedLoopId}
          onSelectLoop={(id) => {
            setReturnRouteOverride(null);
            setSelectedLoopId(id);
          }}
          selectablePois={selectablePois}
          selectedPoiIds={selectedPoiIds}
          onTogglePoiStop={handleTogglePoiStop}
          onClearCustomStops={() => {
            setReturnRouteOverride(null);
            setSelectedPoiIds([]);
          }}
          activeRoute={activeRoute}
          isNavigating={isNavigating}
          navState={navState}
          voiceEnabled={voiceEnabled}
          onToggleVoice={() => setVoiceEnabled((v) => !v)}
          onStartWalk={handleStartWalk}
          onEndWalk={handleEndWalk}
          onBackToParking={handleBackToParking}
        />
      </div>

      {focusedPoi && (
        <PoiModal
          poi={focusedPoi}
          facilityStatus={status.facilities[focusedPoi.id]}
          onClose={() => setFocusedPoi(null)}
          onWalkHere={handleWalkToPoiFromModal}
        />
      )}

      {safetyOpen && (
        <SafetyDrawer
          statusConfig={status}
          sunsetInfo={sunsetInfo}
          userPosition={geo.position}
          onClose={() => setSafetyOpen(false)}
          onBackToParking={handleBackToParking}
        />
      )}
    </main>
  );
};

export default App;
