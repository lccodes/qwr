import React, { useState } from 'react';
import {
  AlertTriangle,
  Car,
  Compass,
  Footprints,
  MapPin,
  Navigation,
  Route,
  Square,
  Volume2,
  VolumeX
} from 'lucide-react';
import type {
  NavigationState,
  PoiDef,
  ResolvedRoute,
  StandardLoopDef
} from '../types';
import { formatMiles } from '../engine/geo';

interface BottomSheetProps {
  mode: 'standard' | 'custom';
  onModeChange: (mode: 'standard' | 'custom') => void;
  standardLoops: StandardLoopDef[];
  resolvedStandardLoops: Record<string, ResolvedRoute | null>;
  selectedLoopId: string;
  onSelectLoop: (loopId: string) => void;
  selectablePois: PoiDef[];
  selectedPoiIds: string[];
  onTogglePoiStop: (poiId: string) => void;
  onClearCustomStops: () => void;
  activeRoute: ResolvedRoute | null;
  isNavigating: boolean;
  navState: NavigationState | null;
  voiceEnabled: boolean;
  simulatorFeatureEnabled: boolean;
  onToggleVoice: () => void;
  onStartWalk: (useSimulator: boolean) => void;
  onEndWalk: () => void;
  onBackToParking: () => void;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  mode,
  onModeChange,
  standardLoops,
  resolvedStandardLoops,
  selectedLoopId,
  onSelectLoop,
  selectablePois,
  selectedPoiIds,
  onTogglePoiStop,
  onClearCustomStops,
  activeRoute,
  isNavigating,
  navState,
  voiceEnabled,
  simulatorFeatureEnabled,
  onToggleVoice,
  onStartWalk,
  onEndWalk,
  onBackToParking
}) => {
  const [collapsed, setCollapsed] = useState(false);

  // Active GPS Walk Slim HUD
  if (isNavigating && activeRoute) {
    const remainingMeters =
      navState?.remainingDistanceMeters ?? activeRoute.distanceMeters;
    const remainingMin =
      navState?.remainingMinutes ?? activeRoute.estimatedMinutes;
    const pct = Math.round((navState?.progressRatio ?? 0) * 100);

    return (
      <section className="bottom-sheet" aria-label="Active walk controls">
        <div className="active-hud">
          <div className="active-hud-stats">
            <div className="active-route-title">
              <span
                className="blaze-dot"
                style={{ background: activeRoute.colorHex }}
              />
              <span>{activeRoute.title}</span>
            </div>
            <div className="active-remaining tabular">
              {formatMiles(remainingMeters)} · ~{remainingMin} min
            </div>
          </div>

          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>

          <div className="active-hud-actions">
            <button
              type="button"
              className={`hud-pill-btn ${voiceEnabled ? 'voice-on' : ''}`}
              onClick={onToggleVoice}
              aria-label={voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'}
            >
              {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
              <span>Voice</span>
            </button>

            <button
              type="button"
              className="hud-pill-btn parking-btn"
              onClick={onBackToParking}
            >
              <Car size={20} />
              <span>Back to Parking</span>
            </button>

            <button
              type="button"
              className="hud-pill-btn end-btn"
              onClick={onEndWalk}
              aria-label="End walk"
            >
              <Square size={16} fill="currentColor" />
              <span>End</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bottom-sheet" aria-label="Choose a trail">
      <button
        type="button"
        className="sheet-handle-btn"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Expand trail picker' : 'Collapse trail picker'}
      >
        <span className="sheet-handle-bar" />
      </button>

      {!collapsed && (
        <>
          <div className="mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'standard'}
              className={`mode-tab ${mode === 'standard' ? 'active' : ''}`}
              onClick={() => onModeChange('standard')}
            >
              <Route size={18} />
              <span>Standard Trails</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'custom'}
              className={`mode-tab ${mode === 'custom' ? 'active' : ''}`}
              onClick={() => onModeChange('custom')}
            >
              <MapPin size={18} />
              <span>Take Me To…</span>
            </button>
          </div>

          {mode === 'standard' ? (
            <div className="loop-grid">
              {standardLoops.map((loop) => {
                const resolved = resolvedStandardLoops[loop.id];
                const isSelected = selectedLoopId === loop.id;
                const displayMiles = resolved
                  ? resolved.distanceMiles.toFixed(1)
                  : loop.canonicalMiles.toFixed(1);
                return (
                  <button
                    key={loop.id}
                    type="button"
                    className={`loop-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelectLoop(loop.id)}
                  >
                    <div className="loop-card-top">
                      <span className="loop-badge">
                        <span
                          className={`blaze-dot ${loop.badgeShape}`}
                          style={{ background: loop.colorHex }}
                        />
                        <span>{loop.name}</span>
                      </span>
                      <span className="loop-dist tabular">{displayMiles} mi</span>
                    </div>
                    <div className="loop-summary">{loop.summary}</div>
                    {resolved?.isDetoured && (
                      <span className="loop-detour-tag">
                        <AlertTriangle size={11} />
                        Open detour
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8
                }}
              >
                <p className="stops-intro" style={{ margin: 0 }}>
                  Tap 1 or more places to build an open loop back to Parking:
                </p>
                {selectedPoiIds.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearCustomStops}
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      color: '#C62828',
                      padding: '4px 8px'
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="stops-grid">
                {selectablePois.map((poi) => {
                  const idx = selectedPoiIds.indexOf(poi.id);
                  const selected = idx >= 0;
                  return (
                    <button
                      key={poi.id}
                      type="button"
                      className={`stop-chip ${selected ? 'selected' : ''}`}
                      onClick={() => onTogglePoiStop(poi.id)}
                    >
                      <Compass size={17} style={{ flexShrink: 0 }} />
                      <span>{poi.shortName}</span>
                      {selected && (
                        <span className="stop-order-num">{idx + 1}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Selected Route Summary + Giant Start Walk Button */}
      <div className="route-cta-bar">
        {activeRoute ? (
          <>
            <div className="route-meta-row">
              <span>{activeRoute.title}</span>
              <span className="tabular" style={{ color: 'var(--qwr-moss)' }}>
                {activeRoute.distanceMiles.toFixed(1)} mi · ~
                {activeRoute.estimatedMinutes} min
              </span>
            </div>

            {!collapsed && activeRoute.isDetoured && activeRoute.detourNote && (
              <div className="route-detour-banner">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{activeRoute.detourNote}</span>
              </div>
            )}

            <div className="cta-btn-row">
              <button
                type="button"
                className="primary-cta"
                onClick={() => onStartWalk(false)}
              >
                <Navigation size={20} />
                <span>Start GPS Walk</span>
              </button>
              {simulatorFeatureEnabled && (
                <button
                  type="button"
                  className="secondary-cta"
                  onClick={() => onStartWalk(true)}
                  title="Try a simulated virtual walk on this trail"
                >
                  <Footprints size={18} />
                  <span>Demo</span>
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="route-meta-row" style={{ justifyContent: 'center' }}>
            <span style={{ color: 'var(--ink-secondary)' }}>
              Tap any landmark above to build your walk
            </span>
          </div>
        )}
      </div>
    </section>
  );
};
