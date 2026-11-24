import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PoiDef, ResolvedRoute } from './types';
import { FEATURE_FLAGS } from './config/featureFlags';
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
import { useWakeLock } from './hooks/useWakeLock';
import { RefugeMap } from './components/RefugeMap';
import { TopHud } from './components/TopHud';
import { BottomSheet } from './components/BottomSheet';
import { PoiModal } from './components/PoiModal';
import { SafetyDrawer } from './components/SafetyDrawer';
import { SimulatorBar } from './components/SimulatorBar';

const SIMULATOR_ENABLED = FEATURE_FLAGS.virtualWalkSimulator;

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

  // Keep mobile screen awake while actively walking a trail
  useWakeLock(isNavigating);

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

  const geo = useGeolocation(activeRoute, SIMULATOR_ENABLED);
  // Prefer live device compass for real hikers; prefer simulated heading only when simulator is active
  const compass = useCompass(geo.gpsHeadingDeg, geo.simEnabled);

  // Evaluate live turn-by-turn & off-track state with hysteresis (only when on-site at QWR)
  const wasOffTrackRef = useRef(false);
  const navState = useMemo(() => {
    if (!isNavigating || !activeRoute || !geo.position || geo.isAwayFromRefuge) {
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
  }, [
    isNavigating,
    activeRoute,
    geo.position,
    geo.isAwayFromRefuge,
    compass.headingDeg
  ]);

  useGuidanceCues(navState, isNavigating && !geo.isAwayFromRefuge, voiceEnabled);

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
      if (SIMULATOR_ENABLED && useSimulator) {
        geo.enableSimulator(true);
      } else {
        geo.disableSimulator();
        geo.startLiveGps(geo.gpsStatus === 'denied' || geo.gpsStatus === 'unavailable');
      }
      setHeadingUp(true);
      setIsNavigating(true);
    },
    [activeRoute, compass, geo]
  );

  const handleEndWalk = useCallback(() => {
    setIsNavigating(false);
    setReturnRouteOverride(null);
    if (SIMULATOR_ENABLED) {
      geo.setSimPlaying(false);
    }
  }, [geo]);

  const handleBackToParking = useCallback(async () => {
    if (!network || !status) return;
    await compass.requestCompassPermission();
    if (!geo.simEnabled) {
      geo.startLiveGps(geo.gpsStatus === 'denied' || geo.gpsStatus === 'unavailable');
    }
    const onSiteCoord =
      geo.position && !geo.isAwayFromRefuge ? geo.position : null;
    const fromCoord =
      onSiteCoord ??
      activeRoute?.polyline[Math.floor((activeRoute.polyline.length || 1) / 2)] ?? {
        lat: 40.8402,
        lng: -72.6155
      };
    const rescue = routeBackToParking(network, status, fromCoord);
    if (!rescue) return;
    setReturnRouteOverride(rescue);
    setIsNavigating(true);
    setHeadingUp(true);
    if (SIMULATOR_ENABLED && geo.simEnabled) {
      geo.setSimProgress(0);
      geo.setSimPlaying(true);
    }
  }, [network, status, compass, geo, activeRoute]);

  const handleWalkToPoiFromModal = useCallback((poi: PoiDef) => {
    setFocusedPoi(null);
    setReturnRouteOverride(null);
    setMode('custom');
    setSelectedPoiIds([poi.id]);
  }, []);

  const handleStartVirtualWalkQuick = useCallback(() => {
    if (!SIMULATOR_ENABLED) return;
    if (!activeRoute) {
      setMode('standard');
      setSelectedLoopId('yellow-14');
    }
    geo.enableSimulator(true);
    setHeadingUp(true);
    setIsNavigating(true);
  }, [activeRoute, geo]);

  const handleCycleSpeed = useCallback(() => {
    if (!SIMULATOR_ENABLED) return;
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
        isAwayFromRefuge={geo.isAwayFromRefuge}
        accuracyMeters={geo.accuracyMeters}
        headingDeg={compass.headingDeg}
        navState={navState}
        headingUp={headingUp}
        onToggleHeadingUp={async () => {
          await compass.requestCompassPermission();
          setHeadingUp((h) => !h);
        }}
        onRequestGps={() => geo.startLiveGps(geo.gpsStatus === 'denied' || geo.gpsStatus === 'unavailable')}
        onSelectPoi={(poi) => setFocusedPoi(poi)}
        simTapToMove={SIMULATOR_ENABLED && geo.simTapToMove}
        onMapTeleport={(coord) => {
          if (!SIMULATOR_ENABLED) return;
          geo.teleportSimPosition(coord);
          if (!isNavigating && activeRoute) {
            setIsNavigating(true);
          }
        }}
      />

      <TopHud
        isNavigating={isNavigating}
        activeRoute={activeRoute}
        navState={navState}
        gpsStatus={geo.gpsStatus}
        sunsetInfo={sunsetInfo}
        statusConfig={status}
        isOffline={isOffline}
        offlineReady={offlineReady}
        isAwayFromRefuge={geo.isAwayFromRefuge}
        simulatorFeatureEnabled={SIMULATOR_ENABLED}
        simEnabled={geo.simEnabled}
        onOpenSafety={() => setSafetyOpen(true)}
        onStartVirtualWalk={handleStartVirtualWalkQuick}
        onRetryGps={() => geo.startLiveGps(true)}
        onRerouteBackToParking={handleBackToParking}
      />

      <div className="bottom-sheet-wrap">
        {SIMULATOR_ENABLED && geo.simEnabled && (
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
          simulatorFeatureEnabled={SIMULATOR_ENABLED}
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
          accuracyMeters={geo.accuracyMeters}
          gpsStatus={geo.gpsStatus}
          isAwayFromRefuge={geo.isAwayFromRefuge}
          distanceFromRefugeMeters={geo.distanceFromRefugeMeters}
          onClose={() => setSafetyOpen(false)}
          onBackToParking={handleBackToParking}
          onRequestGps={() => geo.startLiveGps(true)}
        />
      )}
    </main>
  );
};

export default App;
