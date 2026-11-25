import React from 'react';
import {
  AlertTriangle,
  Footprints,
  Home,
  Navigation,
  Sparkles,
  TreePine,
  X
} from 'lucide-react';
import type { FacilityStatusEntry, PoiDef } from '../types';
import type { FairyDellRouteOption } from '../engine/router';

interface PoiModalProps {
  poi: PoiDef;
  facilityStatus?: FacilityStatusEntry;
  onClose: () => void;
  onWalkHere: (poi: PoiDef) => void;
  onSelectFairyDellRoute?: (option: FairyDellRouteOption) => void;
  onViewEducationCottage?: () => void;
}

export const PoiModal: React.FC<PoiModalProps> = ({
  poi,
  facilityStatus,
  onClose,
  onWalkHere,
  onSelectFairyDellRoute,
  onViewEducationCottage
}) => {
  const isClosed = facilityStatus?.status === 'closed';
  const isFairyDell = poi.id === 'fairy-dell';

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={poi.name}
      onClick={onClose}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{poi.name}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close landmark card"
          >
            <X size={20} />
          </button>
        </div>

        {facilityStatus && facilityStatus.status !== 'open' && (
          <div className={isClosed ? 'poi-closed-banner' : 'route-detour-banner'}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>Currently {facilityStatus.status.toUpperCase()}:</strong>{' '}
              {facilityStatus.note}
            </span>
          </div>
        )}

        <p className="modal-body-text">{poi.description}</p>

        <div className="kid-tip-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Sparkles size={16} />
            <span>Nature Explorer Tip</span>
          </div>
          <div>{poi.kidTip}</div>
        </div>

        {isClosed ? (
          onViewEducationCottage && (
            <button
              type="button"
              className="primary-cta"
              onClick={onViewEducationCottage}
            >
              <Home size={20} />
              <span>View Temporary Office / Education Cottage</span>
            </button>
          )
        ) : isFairyDell && onSelectFairyDellRoute ? (
          <div className="poi-dual-actions">
            <button
              type="button"
              className="poi-route-btn wooded"
              onClick={() => onSelectFairyDellRoute('gigis-path')}
            >
              <TreePine size={22} style={{ flexShrink: 0 }} />
              <span className="poi-route-btn-text">
                <span className="poi-route-btn-title">
                  Gigi&apos;s Path to Fairy Dell
                </span>
                <span className="poi-route-btn-sub">
                  Wooded off-road trail west of Old Main Rd
                </span>
              </span>
            </button>

            <button
              type="button"
              className="poi-route-btn roadside"
              onClick={() => onSelectFairyDellRoute('roadside')}
            >
              <Footprints size={22} style={{ flexShrink: 0 }} />
              <span className="poi-route-btn-text">
                <span className="poi-route-btn-title">
                  Roadside walk to Fairy Dell
                </span>
                <span className="poi-route-btn-sub">
                  Existing walk along Old Main Rd &amp; crosswalks
                </span>
              </span>
            </button>
          </div>
        ) : (
          poi.id !== 'parking' && (
            <button
              type="button"
              className="primary-cta"
              onClick={() => onWalkHere(poi)}
            >
              <Navigation size={20} />
              <span>Walk Here from Parking</span>
            </button>
          )
        )}
      </div>
    </div>
  );
};
