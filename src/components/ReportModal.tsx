import React, { useMemo, useState } from 'react';
import {
  Binoculars,
  Check,
  Copy,
  Mail,
  MapPin,
  TreePine,
  WifiOff,
  X
} from 'lucide-react';
import type { LatLng, TrailNetwork } from '../types';
import {
  buildReportEmail,
  findNearestLandmark,
  QWR_REPORT_EMAIL,
  TREE_IMPACT_LABELS,
  type ReportCategory,
  type TreeImpactLevel
} from '../engine/report';

interface ReportModalProps {
  network: TrailNetwork;
  userPosition: LatLng | null;
  isAwayFromRefuge: boolean;
  isOffline: boolean;
  onClose: () => void;
}

const QUICK_SPECIES = [
  'Red Fox',
  'Box Turtle',
  'Osprey',
  'Owl',
  'White-Tailed Deer',
  'Snapping Turtle'
];

const IMPACT_OPTIONS: TreeImpactLevel[] = [
  'blocking-trail',
  'partially-blocking',
  'hanging-overhead',
  'off-trail'
];

export const ReportModal: React.FC<ReportModalProps> = ({
  network,
  userPosition,
  isAwayFromRefuge,
  isOffline,
  onClose
}) => {
  const [category, setCategory] = useState<ReportCategory>('downed-tree');
  const [treeImpact, setTreeImpact] =
    useState<TreeImpactLevel>('blocking-trail');
  const [species, setSpecies] = useState('');
  const [notes, setNotes] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [copied, setCopied] = useState(false);

  const effectivePosition =
    userPosition && !isAwayFromRefuge ? userPosition : null;

  const nearest = useMemo(
    () => findNearestLandmark(network, effectivePosition),
    [network, effectivePosition]
  );

  const emailPayload = useMemo(
    () =>
      buildReportEmail({
        category,
        position: effectivePosition,
        isOnRefuge: nearest.isOnRefuge,
        nearestLocation: nearest.label,
        nearestShortName: nearest.shortName,
        treeImpact,
        species,
        notes,
        reporterName
      }),
    [
      category,
      effectivePosition,
      nearest.isOnRefuge,
      nearest.label,
      nearest.shortName,
      treeImpact,
      species,
      notes,
      reporterName
    ]
  );

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(emailPayload.plainTextCopy);
      } else {
        const ta = document.createElement('textarea');
        ta.value = emailPayload.plainTextCopy;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Report a Downed Tree or Animal Sighting"
      onClick={onClose}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Report to the Refuge</h2>
            <p className="report-subtitle">
              Generates a pre-filled email to{' '}
              <strong>{QWR_REPORT_EMAIL}</strong>
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close report form"
          >
            <X size={20} />
          </button>
        </div>

        {/* Category Picker — 2 Oversized Tactile Cards */}
        <div
          className="report-choice-grid"
          role="radiogroup"
          aria-label="Report type"
        >
          <button
            type="button"
            role="radio"
            aria-checked={category === 'downed-tree'}
            className={`report-choice-card ${
              category === 'downed-tree' ? 'selected' : ''
            }`}
            onClick={() => setCategory('downed-tree')}
          >
            <TreePine size={24} />
            <span className="report-choice-title">Downed Tree</span>
            <span className="report-choice-desc">Fallen limb or blockage</span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={category === 'animal-sighting'}
            className={`report-choice-card ${
              category === 'animal-sighting' ? 'selected' : ''
            }`}
            onClick={() => setCategory('animal-sighting')}
          >
            <Binoculars size={24} />
            <span className="report-choice-title">Animal Sighting</span>
            <span className="report-choice-desc">Wildlife spotted on trail</span>
          </button>
        </div>

        {/* Auto-Filled Location Summary */}
        <div className="safety-info-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={16} />
            <strong>Location Included in Email</strong>
          </div>
          <div>{nearest.label}</div>
          {effectivePosition && (
            <div
              className="tabular"
              style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--qwr-pine)' }}
            >
              GPS: {effectivePosition.lat.toFixed(5)}° N,{' '}
              {Math.abs(effectivePosition.lng).toFixed(5)}° W (Map pin link
              attached)
            </div>
          )}
        </div>

        {/* Tailored Fields per Category */}
        {category === 'downed-tree' ? (
          <div className="report-field">
            <span className="report-label">How is it affecting the trail?</span>
            <div className="report-chip-grid">
              {IMPACT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`report-chip ${treeImpact === opt ? 'selected' : ''}`}
                  onClick={() => setTreeImpact(opt)}
                >
                  {TREE_IMPACT_LABELS[opt]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="report-field">
            <label htmlFor="report-species" className="report-label">
              Animal / Species Seen
            </label>
            <input
              id="report-species"
              type="text"
              className="report-input"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder="e.g. Red Fox, Box Turtle, Barred Owl…"
            />
            <div className="report-species-pills">
              {QUICK_SPECIES.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  className={`report-species-pill ${
                    species.toLowerCase() === sp.toLowerCase() ? 'selected' : ''
                  }`}
                  onClick={() => setSpecies(sp)}
                >
                  {sp}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="report-field">
          <label htmlFor="report-notes" className="report-label">
            {category === 'downed-tree'
              ? 'Details (optional)'
              : 'Behavior or Notes (optional)'}
          </label>
          <textarea
            id="report-notes"
            className="report-textarea"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              category === 'downed-tree'
                ? 'Trail color, nearest landmark, or safety notes…'
                : 'How many, behavior, or if the animal looks injured…'
            }
          />
        </div>

        <div className="report-field">
          <label htmlFor="report-name" className="report-label">
            Your Name or Contact (optional)
          </label>
          <input
            id="report-name"
            type="text"
            className="report-input"
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
            placeholder="Optional in case Refuge staff have a question"
          />
        </div>

        {isOffline && (
          <div className="route-detour-banner">
            <WifiOff size={16} style={{ flexShrink: 0 }} />
            <span>
              Offline right now — your mail app will queue this email until
              signal returns, or copy the text below.
            </span>
          </div>
        )}

        {/* Primary Email Launcher + Copy Fallback */}
        <div className="report-actions">
          <a
            href={emailPayload.mailtoHref}
            className="primary-cta"
            style={{ textDecoration: 'none' }}
          >
            <Mail size={20} />
            <span>Open Email to QWR</span>
          </a>

          <button
            type="button"
            className="safety-action-link"
            onClick={handleCopy}
          >
            {copied ? <Check size={19} /> : <Copy size={19} />}
            <span>
              {copied
                ? 'Copied Report Text!'
                : 'Copy Report Text (Alternative)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
