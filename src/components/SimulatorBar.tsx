import React from 'react';
import {
  AlertTriangle,
  Crosshair,
  Gauge,
  Pause,
  Play,
  X
} from 'lucide-react';

interface SimulatorBarProps {
  playing: boolean;
  speed: 1 | 3 | 8;
  progress: number;
  offTrack: boolean;
  tapToMove: boolean;
  onTogglePlay: () => void;
  onCycleSpeed: () => void;
  onScrubProgress: (ratio: number) => void;
  onToggleOffTrack: () => void;
  onToggleTapToMove: () => void;
  onClose: () => void;
}

export const SimulatorBar: React.FC<SimulatorBarProps> = ({
  playing,
  speed,
  progress,
  offTrack,
  tapToMove,
  onTogglePlay,
  onCycleSpeed,
  onScrubProgress,
  onToggleOffTrack,
  onToggleTapToMove,
  onClose
}) => {
  return (
    <div className="sim-bar" role="region" aria-label="Virtual Walk GPS Simulator">
      <div className="sim-top-row">
        <span>VIRTUAL WALK SIMULATOR · {Math.round(progress * 100)}%</span>
        <button
          type="button"
          onClick={onClose}
          style={{ color: '#F7F4EC', padding: 4 }}
          aria-label="Close virtual walk simulator"
        >
          <X size={16} />
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        onChange={(e) => onScrubProgress(Number(e.target.value) / 1000)}
        className="sim-slider"
        aria-label="Scrub walk progress"
      />

      <div className="sim-btn-row">
        <button
          type="button"
          className={`sim-btn ${playing ? 'active' : ''}`}
          onClick={onTogglePlay}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
          <span>{playing ? 'Pause' : 'Walk'}</span>
        </button>

        <button type="button" className="sim-btn" onClick={onCycleSpeed}>
          <Gauge size={14} />
          <span>{speed}×</span>
        </button>

        <button
          type="button"
          className={`sim-btn ${offTrack ? 'danger-active' : ''}`}
          onClick={onToggleOffTrack}
        >
          <AlertTriangle size={14} />
          <span>{offTrack ? 'Rejoin Trail' : 'Go Off-Track'}</span>
        </button>

        <button
          type="button"
          className={`sim-btn ${tapToMove ? 'active' : ''}`}
          onClick={onToggleTapToMove}
        >
          <Crosshair size={14} />
          <span>{tapToMove ? 'Tap Map Active' : 'Tap to Move'}</span>
        </button>
      </div>
    </div>
  );
};
