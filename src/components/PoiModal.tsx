import React from 'react';
import { AlertTriangle, Navigation, Sparkles, X } from 'lucide-react';
import type { FacilityStatusEntry, PoiDef } from '../types';

interface PoiModalProps {
  poi: PoiDef;
  facilityStatus?: FacilityStatusEntry;
  onClose: () => void;
  onWalkHere: (poi: PoiDef) => void;
}

export const PoiModal: React.FC<PoiModalProps> = ({
  poi,
  facilityStatus,
  onClose,
  onWalkHere
}) => {
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
          <div className="route-detour-banner">
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>
              <strong>Currently {facilityStatus.status}:</strong>{' '}
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

        {poi.id !== 'parking' && (
          <button
            type="button"
            className="primary-cta"
            onClick={() => onWalkHere(poi)}
          >
            <Navigation size={20} />
            <span>Walk Here from Parking</span>
          </button>
        )}
      </div>
    </div>
  );
};
