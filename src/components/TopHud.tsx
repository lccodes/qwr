import React from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CheckCircle2,
  CornerUpLeft,
  Footprints,
  LocateFixed,
  MapPin,
  PhoneCall,
  RefreshCw,
  Sunset,
  WifiOff
} from 'lucide-react';
import type {
  NavigationState,
  ResolvedRoute,
  SunsetInfo,
  TrailStatusConfig,
  TurnType
} from '../types';
import type { GeoHookState } from '../hooks/useGeolocation';

interface TopHudProps {
  isNavigating: boolean;
  activeRoute: ResolvedRoute | null;
  navState: NavigationState | null;
  gpsStatus: GeoHookState['gpsStatus'];
  sunsetInfo: SunsetInfo;
  statusConfig: TrailStatusConfig;
  isOffline: boolean;
  offlineReady: boolean;
  isAwayFromRefuge: boolean;
  simulatorFeatureEnabled: boolean;
  simEnabled: boolean;
  onOpenSafety: () => void;
  onStartVirtualWalk: () => void;
  onRetryGps: () => void;
  onRerouteBackToParking: () => void;
}

function TurnArrowIcon({
  turnType,
  isOffTrack,
  rejoinRelativeDeg,
  rejoinBearingDeg
}: {
  turnType?: TurnType;
  isOffTrack: boolean;
  rejoinRelativeDeg: number | null;
  rejoinBearingDeg: number;
}) {
  if (isOffTrack) {
    const rot = rejoinRelativeDeg !== null ? rejoinRelativeDeg : rejoinBearingDeg;
    return (
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        style={{
          transform: `rotate(${Math.round(rot)}deg)`,
          transition: 'transform 0.2s ease'
        }}
        aria-hidden="true"
      >
        <path
          d="M18 4 L30 30 L18 24 L6 30 Z"
          fill="#FFFFFF"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  switch (turnType) {
    case 'left':
      return <ArrowLeft size={36} strokeWidth={2.8} />;
    case 'slight-left':
      return <ArrowUpLeft size={36} strokeWidth={2.8} />;
    case 'sharp-left':
      return <ArrowDownLeft size={36} strokeWidth={2.8} />;
    case 'right':
      return <ArrowRight size={36} strokeWidth={2.8} />;
    case 'slight-right':
      return <ArrowUpRight size={36} strokeWidth={2.8} />;
    case 'sharp-right':
      return (
        <ArrowDownLeft
          size={36}
          strokeWidth={2.8}
          style={{ transform: 'scaleX(-1)' }}
        />
      );
    case 'u-turn':
      return <CornerUpLeft size={34} strokeWidth={2.8} />;
    case 'arrive':
      return <CheckCircle2 size={36} strokeWidth={2.6} />;
    default:
      return <ArrowUp size={36} strokeWidth={2.8} />;
  }
}

export const TopHud: React.FC<TopHudProps> = ({
  isNavigating,
  activeRoute,
  navState,
  gpsStatus,
  sunsetInfo,
  statusConfig,
  isOffline,
  offlineReady,
  isAwayFromRefuge,
  simulatorFeatureEnabled,
  simEnabled,
  onOpenSafety,
  onStartVirtualWalk,
  onRetryGps,
  onRerouteBackToParking
}) => {
  if (isNavigating) {
    // 1. Live on-site GPS navigation state
    if (navState && !isAwayFromRefuge) {
      const bannerClass = navState.hasArrived
        ? 'nav-banner arrived'
        : navState.isOffTrack
          ? 'nav-banner off-track'
          : 'nav-banner';

      return (
        <header className="top-hud">
          <div className={bannerClass} role="status" aria-live="polite">
            <div className="nav-arrow-box" aria-hidden="true">
              <TurnArrowIcon
                turnType={navState.nextStep?.turnType}
                isOffTrack={navState.isOffTrack}
                rejoinRelativeDeg={navState.rejoinRelativeDeg}
                rejoinBearingDeg={navState.rejoinBearingDeg}
              />
            </div>
            <div className="nav-banner-text">
              <div className="nav-headline">{navState.headline}</div>
              <div className="nav-subline tabular">{navState.subline}</div>
              {navState.isOffTrack && (
                <button
                  type="button"
                  className="nav-reroute-btn"
                  onClick={onRerouteBackToParking}
                >
                  <RefreshCw size={15} />
                  Guide me straight to Parking
                </button>
              )}
            </div>
            <button
              type="button"
              className="icon-btn"
              style={{
                background: 'rgba(255,255,255,0.18)',
                color: '#FFFFFF',
                borderColor: 'rgba(255,255,255,0.22)'
              }}
              onClick={onOpenSafety}
              aria-label="Safety and refuge phone"
            >
              <PhoneCall size={20} />
            </button>
          </div>
        </header>
      );
    }

    // 2. Real browser GPS states (permission denied, away from Refuge, acquiring satellite lock)
    const isPermissionIssue = gpsStatus === 'denied' || gpsStatus === 'unavailable';
    const bannerClass = isPermissionIssue ? 'nav-banner off-track' : 'nav-banner';

    let headline = 'Finding your GPS location…';
    let subline = 'Step into an open spot for a faster satellite lock';
    if (isAwayFromRefuge) {
      headline = 'You’re away from the Refuge';
      subline = `Previewing ${activeRoute?.title ?? 'trail'} · Live GPS starts at QWR`;
    } else if (gpsStatus === 'denied') {
      headline = 'Location access is off';
      subline = 'Enable Location in your browser settings to track your walk';
    } else if (gpsStatus === 'unavailable') {
      headline = 'Waiting for GPS signal';
      subline = 'Check that Location Services are turned on for your device';
    }

    return (
      <header className="top-hud">
        <div className={bannerClass} role="status" aria-live="polite">
          <div className="nav-arrow-box" aria-hidden="true">
            {isAwayFromRefuge ? (
              <MapPin size={32} strokeWidth={2.5} />
            ) : isPermissionIssue ? (
              <AlertTriangle size={32} strokeWidth={2.5} />
            ) : (
              <LocateFixed size={32} strokeWidth={2.5} />
            )}
          </div>
          <div className="nav-banner-text">
            <div className="nav-headline">{headline}</div>
            <div className="nav-subline">{subline}</div>
            {isPermissionIssue && (
              <button
                type="button"
                className="nav-reroute-btn"
                onClick={onRetryGps}
              >
                <RefreshCw size={15} />
                Retry GPS
              </button>
            )}
          </div>
          <button
            type="button"
            className="icon-btn"
            style={{
              background: 'rgba(255,255,255,0.18)',
              color: '#FFFFFF',
              borderColor: 'rgba(255,255,255,0.22)'
            }}
            onClick={onOpenSafety}
            aria-label="Safety and refuge phone"
          >
            <PhoneCall size={20} />
          </button>
        </div>
      </header>
    );
  }

  const closedCount = Object.values(statusConfig.segments).filter(
    (s) => s.status === 'closed'
  ).length;

  return (
    <header className="top-hud">
      <div className="explore-header">
        <div className="brand-group">
          <img
            src="./icons/qwr-icon.svg"
            alt="Quogue Wildlife Refuge crest"
            className="brand-crest"
          />
          <div className="brand-titles">
            <h1>Quogue Wildlife Refuge</h1>
            <div className="brand-meta">
              <span className={`sunset-chip ${sunsetInfo.status}`}>
                <Sunset size={14} />
                <span>{sunsetInfo.label}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="header-actions">
          {simulatorFeatureEnabled && (
            <button
              type="button"
              className="icon-btn"
              onClick={onStartVirtualWalk}
              aria-label="Virtual Walk GPS simulator"
              title="Test Virtual Walk"
            >
              <Footprints size={20} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn primary-tint"
            onClick={onOpenSafety}
            aria-label="Safety, park hours, and call office"
            title="Safety & Help"
          >
            <PhoneCall size={20} />
          </button>
        </div>
      </div>

      <div className="status-strip">
        {closedCount > 0 && statusConfig.globalAlert?.active && (
          <button
            type="button"
            className="mini-pill warning"
            onClick={onOpenSafety}
          >
            <AlertTriangle size={13} />
            <span>SW Closed · Detour On</span>
          </button>
        )}

        {(isOffline || offlineReady) && (
          <span className="mini-pill offline">
            <WifiOff size={13} />
            <span>{isOffline ? 'Offline Mode Active' : 'Offline Ready'}</span>
          </span>
        )}

        {simulatorFeatureEnabled && isAwayFromRefuge && !simEnabled && (
          <button
            type="button"
            className="mini-pill sim-offer"
            onClick={onStartVirtualWalk}
          >
            <Footprints size={13} />
            <span>Virtual Walk</span>
          </button>
        )}
      </div>
    </header>
  );
};
