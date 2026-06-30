import { useState } from 'react';
import './DentalChart.css';

const STATUSES = [
  { key: 'normal',     label: 'Normal' },
  { key: 'missing',    label: 'Ausente' },
  { key: 'restored',   label: 'Restaurado' },
  { key: 'prosthetic', label: 'Prótesis' },
];

/* Tooth type definitions with SVG paths.
   Default orientation: Crown points UP (smaller Y), Roots point DOWN (larger Y). */
const TOOTH_SHAPES = {
  molar: {
    width: 32, height: 38,
    path: 'M6 6C4 6 2 8 2 12V24C2 30 5 36 10 36H22C27 36 30 30 30 24V12C30 8 28 6 26 6H22C20 6 19 8 16 8C13 8 12 6 10 6H6Z',
  },
  premolar: {
    width: 26, height: 38,
    path: 'M5 6C3 6 2 8 2 12V24C2 30 5 36 9 36H17C21 36 24 30 24 24V12C24 8 23 6 21 6H17C15.5 6 14.5 8 13 8C11.5 8 10.5 6 9 6H5Z',
  },
  canine: {
    width: 22, height: 40,
    path: 'M5 6C3 6 2 8 2 12V22C2 28 4 36 8 38H14C18 36 20 28 20 22V12C20 8 19 6 17 6H5Z',
  },
  incisor: {
    width: 20, height: 36,
    path: 'M4 6C2.5 6 2 8 2 11V22C2 28 4 32 7 34H13C16 32 18 28 18 22V11C18 8 17.5 6 16 6H4Z',
  },
  central_incisor: {
    width: 22, height: 36,
    path: 'M4 6C2.5 6 2 8 2 11V22C2 28 4 32 8 34H14C18 32 20 28 20 22V11C20 8 19.5 6 18 6H4Z',
  },
};

const TEETH = {
  // Upper Right (1-8)
  1:  { type: 'molar',           name: '3er Molar' },
  2:  { type: 'molar',           name: '2do Molar' },
  3:  { type: 'molar',           name: '1er Molar' },
  4:  { type: 'premolar',        name: '2do Premolar' },
  5:  { type: 'premolar',        name: '1er Premolar' },
  6:  { type: 'canine',          name: 'Canino' },
  7:  { type: 'incisor',         name: 'Incisivo Lat.' },
  8:  { type: 'central_incisor', name: 'Incisivo Cent.' },
  // Upper Left (9-16)
  9:  { type: 'central_incisor', name: 'Incisivo Cent.' },
  10: { type: 'incisor',         name: 'Incisivo Lat.' },
  11: { type: 'canine',          name: 'Canino' },
  12: { type: 'premolar',        name: '1er Premolar' },
  13: { type: 'premolar',        name: '2do Premolar' },
  14: { type: 'molar',           name: '1er Molar' },
  15: { type: 'molar',           name: '2do Molar' },
  16: { type: 'molar',           name: '3er Molar' },
  // Lower Left (17-24)
  17: { type: 'molar',           name: '3er Molar' },
  18: { type: 'molar',           name: '2do Molar' },
  19: { type: 'molar',           name: '1er Molar' },
  20: { type: 'premolar',        name: '2do Premolar' },
  21: { type: 'premolar',        name: '1er Premolar' },
  22: { type: 'canine',          name: 'Canino' },
  23: { type: 'incisor',         name: 'Incisivo Lat.' },
  24: { type: 'central_incisor', name: 'Incisivo Cent.' },
  // Lower Right (25-32)
  25: { type: 'central_incisor', name: 'Incisivo Cent.' },
  26: { type: 'incisor',         name: 'Incisivo Lat.' },
  27: { type: 'canine',          name: 'Canino' },
  28: { type: 'premolar',        name: '1er Premolar' },
  29: { type: 'premolar',        name: '2do Premolar' },
  30: { type: 'molar',           name: '1er Molar' },
  31: { type: 'molar',           name: '2do Molar' },
  32: { type: 'molar',           name: '3er Molar' },
};

const ALL_TEETH = Array.from({ length: 32 }, (_, i) => i + 1);

/* Calculate exact X, Y and Rotation for the parabolic arch mouth shape */
const OFFSETS = [4, 13, 23, 34, 45, 57, 71, 85]; // Angles from midline

const getToothPosition = (id) => {
  let t_deg = 0;
  
  if (id >= 1 && id <= 8) {
    t_deg = 90 + OFFSETS[8 - id];
  } else if (id >= 9 && id <= 16) {
    t_deg = 90 - OFFSETS[id - 9];
  } else if (id >= 17 && id <= 24) {
    t_deg = 270 + OFFSETS[24 - id];
  } else if (id >= 25 && id <= 32) {
    t_deg = 270 - OFFSETS[id - 25];
  }
  
  const t_rad = t_deg * (Math.PI / 180);
  const cx = 250;
  const a = 180;
  const b = 120;
  
  const x = cx + a * Math.cos(t_rad);
  const isLower = id >= 17;
  const cy = isLower ? 240 : 160; 
  const y = cy - b * Math.sin(t_rad);
  
  // Rotation: crown points inwards (towards center)
  const rot = 270 - t_deg;
  
  return { x, y, rot };
};

const STATUS_COLORS = {
  normal: null,
  missing: '#EF4444',
  restored: '#F59E0B',
  prosthetic: '#3B82F6',
};

function ToothSVG({ id, status, onClick, onHover, onLeave }) {
  const tooth = TEETH[id];
  const shape = TOOTH_SHAPES[tooth.type];
  const color = STATUS_COLORS[status];
  const isMissing = status === 'missing';
  const pos = getToothPosition(id);

  // Scaled dimensions based on 500x400 viewBox
  const w_pct = (shape.width / 500) * 100;
  const h_pct = (shape.height / 400) * 100;

  return (
    <button
      type="button"
      className={`tooth-btn tooth-btn--${status}`}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        left: `${(pos.x / 500) * 100}%`,
        top: `${(pos.y / 400) * 100}%`,
        width: `${w_pct}%`,
        height: `${h_pct}%`,
        transform: `translate(-50%, -50%) rotate(${pos.rot}deg)`
      }}
      aria-label={`Diente ${id} (${tooth.name}): ${STATUSES.find(s => s.key === status).label}`}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${shape.width} ${shape.height}`}
        className="tooth-svg"
      >
        <path
          d={shape.path}
          fill={isMissing ? 'none' : (color ? `${color}22` : 'var(--tooth-fill)')}
          stroke={color || 'var(--tooth-stroke)'}
          strokeWidth={isMissing ? '1' : '1.5'}
          strokeDasharray={isMissing ? '3 2' : 'none'}
          opacity={isMissing ? 0.4 : 1}
        />
        {!isMissing && (
          <path
            d={`M${shape.width * 0.2} ${shape.height * 0.35} H${shape.width * 0.8}`}
            stroke={color || 'var(--tooth-stroke)'}
            strokeWidth="0.8"
            opacity="0.4"
          />
        )}
        {status === 'restored' && (
          <circle cx={shape.width / 2} cy={shape.height * 0.25} r="3" fill="#F59E0B" opacity="0.8" />
        )}
        {status === 'prosthetic' && (
          <rect
            x={shape.width / 2 - 3} y={shape.height * 0.2} width="6" height="6" rx="1" fill="#3B82F6" opacity="0.8"
            transform={`rotate(45 ${shape.width / 2} ${shape.height * 0.23})`}
          />
        )}
        {isMissing && (
          <>
            <line x1={shape.width * 0.2} y1={shape.height * 0.3} x2={shape.width * 0.8} y2={shape.height * 0.7} stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
            <line x1={shape.width * 0.8} y1={shape.height * 0.3} x2={shape.width * 0.2} y2={shape.height * 0.7} stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          </>
        )}
      </svg>
      {/* Counter-rotate the number so it's always upright, positioned near the roots */}
      <span 
        className="tooth-btn__num"
        style={{ transform: `translate(-50%, 4px) rotate(${-pos.rot}deg)` }}
      >
        {id}
      </span>
    </button>
  );
}

export default function DentalChart({ value = {}, onChange }) {
  const [hovered, setHovered] = useState(null);
  
  const getStatus = (id) => value[id] || 'normal';

  const cycleTooth = (id) => {
    const current = getStatus(id);
    const idx = STATUSES.findIndex(s => s.key === current);
    const next = STATUSES[(idx + 1) % STATUSES.length].key;
    const updated = { ...value };
    if (next === 'normal') delete updated[id];
    else updated[id] = next;
    onChange(updated);
  };

  const markedCount = Object.keys(value).length;

  return (
    <div className="dental">
      <div className="dental__head">
        <span className="dental__title">Registro dental</span>
        {markedCount > 0 && (
          <span className="dental__count">{markedCount} marcado{markedCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      <p className="dental__help">
        Toque cada diente para marcar su estado: <strong>normal → ausente → restaurado → prótesis</strong>.
      </p>

      {/* The mouth layout */}
      <div className="dental__mouth-wrapper">
        <div className="dental__mouth">
          {ALL_TEETH.map(id => (
            <ToothSVG
              key={id}
              id={id}
              status={getStatus(id)}
              onClick={() => cycleTooth(id)}
              onHover={() => setHovered(id)}
              onLeave={() => setHovered(null)}
            />
          ))}
          {/* Visual guides */}
          <div className="dental__midline" />
          <div className="dental__label dental__label--upper">Superior</div>
          <div className="dental__label dental__label--lower">Inferior</div>
        </div>
      </div>

      <div className={`dental__tooltip ${hovered ? 'dental__tooltip--visible' : ''}`}>
        {hovered ? (
          <><strong>#{hovered}</strong> — {TEETH[hovered].name} — {STATUSES.find(s => s.key === getStatus(hovered)).label}</>
        ) : (
          <>&nbsp;</>
        )}
      </div>

      {/* Legend */}
      <div className="dental__legend">
        <div className="dental__legend-item">
          <span className="dental__legend-swatch dental__legend-swatch--normal" /> Normal
        </div>
        <div className="dental__legend-item">
          <span className="dental__legend-swatch dental__legend-swatch--missing" /> Ausente
        </div>
        <div className="dental__legend-item">
          <span className="dental__legend-swatch dental__legend-swatch--restored" /> Restaurado
        </div>
        <div className="dental__legend-item">
          <span className="dental__legend-swatch dental__legend-swatch--prosthetic" /> Prótesis
        </div>
      </div>
    </div>
  );
}
