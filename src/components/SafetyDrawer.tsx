import React from 'react';
import {
  AlertTriangle,
  Car,
  Clock,
  MapPin,
  PhoneCall,
  ShieldAlert,
  X
} from 'lucide-react';
import type { LatLng, SunsetInfo, TrailStatusConfig } from '../types';
import type { GeoHookState } from '../hooks/useGeolocation';
import { metersToMiles } from '../engine/geo';

interface SafetyDrawerProps {
  statusConfig: TrailStatusConfig;
  sunsetInfo: SunsetInfo;
  userPosition: LatLng | null;
  accuracyMeters: number | null;
  gpsStatus: GeoHookState['gpsStatus'];
  isAwayFromRefuge: boolean;
  distanceFromRefugeMeters: number | null;
  onClose: () => void;
  onBackToParking: () => void;
  onRequestGps: () => void;
}

export const SafetyDrawer: React.FC<SafetyDrawerProps> = ({
  statusConfig,
  sunsetInfo,
  userPosition,
  accuracyMeters,
  gpsStatus,
  isAwayFromRefuge,
  distanceFromRefugeMeters,
  onClose,
  onBackToParking,
  onRequestGps
}) => {
  const closedSegments = Object.entries(statusConfig.segments).filter(
    ([, entry]) => entry.status === 'closed'
  );
  const phoneDigits = statusConfig.refugePhone.replace(/[^0-9]/g, '');

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Safety and Refuge Information"
      onClick={onClose}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Safety &amp; Refuge Info</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close safety drawer"
          >
            <X size={20} />
          </button>
        </div>

        <button
          type="button"
          className="primary-cta"
          onClick={() => {
            onBackToParking();
            onClose();
          }}
        >
          <Car size={22} />
          <span>Guide Me Back to Parking</span>
        </button>

        <a href={`tel:${phoneDigits}`} className="safety-action-link">
          <PhoneCall size={20} />
          <span>Call QWR Office · ({statusConfig.refugePhone})</span>
        </a>

        <div className="safety-info-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} />
            <strong>Today&apos;s Trail Hours</strong>
          </div>
          <div>
            Open daily, sunrise ({sunsetInfo.sunriseText}) to sunset (
            {sunsetInfo.sunsetText}). Free admission 365 days a year.
          </div>
          <div>
            <strong>Address:</strong> 3 Old Country Rd, Quogue, NY 11959
          </div>
        </div>

        <div className="safety-info-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={16} />
            <strong>Your GPS Location</strong>
          </div>
          {userPosition ? (
            <>
              <div
                className="tabular"
                style={{ fontWeight: 700, color: 'var(--qwr-pine)' }}
              >
                {userPosition.lat.toFixed(5)}° N,{' '}
                {Math.abs(userPosition.lng).toFixed(5)}° W
                {accuracyMeters !== null ? ` (±${accuracyMeters} m)` : ''}
              </div>
              {isAwayFromRefuge && distanceFromRefugeMeters !== null && (
                <div>
                  Currently {metersToMiles(distanceFromRefugeMeters).toFixed(1)}{' '}
                  mi from Quogue Wildlife Refuge.
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>
                {gpsStatus === 'denied'
                  ? 'Location permission is turned off in browser settings.'
                  : gpsStatus === 'requesting'
                    ? 'Acquiring satellite GPS fix…'
                    : 'Tap Enable GPS to view your live coordinates.'}
              </span>
              {gpsStatus !== 'requesting' && (
                <button
                  type="button"
                  onClick={onRequestGps}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 10,
                    background: 'var(--qwr-pine)',
                    color: '#fff',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    flexShrink: 0
                  }}
                >
                  Enable GPS
                </button>
              )}
            </div>
          )}
        </div>

        {closedSegments.length > 0 && (
          <div className="safety-info-box" style={{ background: 'var(--alert-bg)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--alert-ink)'
              }}
            >
              <AlertTriangle size={16} />
              <strong>
                Active Trail Closures (as of {statusConfig.lastUpdated})
              </strong>
            </div>
            <div style={{ color: 'var(--alert-ink)' }}>
              {statusConfig.globalAlert?.message}
            </div>
            <ul style={{ margin: '4px 0 0 18px', padding: 0, color: 'var(--alert-ink)' }}>
              {closedSegments.map(([id, entry]) => (
                <li key={id} style={{ marginBottom: 2 }}>
                  {entry.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="safety-info-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldAlert size={16} />
            <strong>Refuge Guidelines</strong>
          </div>
          <div>
            Please stay on open trails. Dogs, bicycles, and picnicking are not
            permitted on Refuge grounds to protect resident wildlife.
          </div>
        </div>
      </div>
    </div>
  );
};
