import React, { useState, useEffect, useCallback, memo } from 'react';

interface InteractiveMapProps {
  selectedDestination: string;
  onZoneSelect: (zoneId: string) => void;
}

/** Interactive SVG stadium map with pan/zoom and keyboard-navigable zones. */
const InteractiveMapInner: React.FC<InteractiveMapProps> = ({ selectedDestination, onZoneSelect }) => {
  const [matrix, setMatrix] = useState<number[]>([1, 0, 0, 1, 0, 0]); // Panning and zooming transform matrix
  const [activeZone, setActiveZone] = useState<string | null>(null);

  // Sync vocal instructions to active map zones
  useEffect(() => {
    if (!selectedDestination) return;
    const normalized = selectedDestination.toLowerCase();
    if (normalized.includes('zone a') || normalized.includes('section a')) {
      setActiveZone('ZoneA');
      onZoneSelect('ZoneA');
    } else if (normalized.includes('zone b') || normalized.includes('section b')) {
      setActiveZone('ZoneB');
      onZoneSelect('ZoneB');
    }
  }, [selectedDestination, onZoneSelect]);

  // Pan using delta transform
  const applyPan = useCallback((dx: number, dy: number) => {
    setMatrix(prev => [prev[0], prev[1], prev[2], prev[3], prev[4] + dx, prev[5] + dy]);
  }, []);

  // Zoom scale boundary validation
  const applyZoom = useCallback((factor: number) => {
    setMatrix(prev => {
      const newZoomX = prev[0] * factor;
      const newZoomY = prev[3] * factor;
      if (newZoomX < 0.5 || newZoomX > 4.0) return prev;
      return [newZoomX, prev[1], prev[2], newZoomY, prev[4], prev[5]];
    });
  }, []);

  const resetView = useCallback(() => {
    setMatrix([1, 0, 0, 1, 0, 0]);
  }, []);

  const handleZoneInteraction = useCallback((zoneId: string) => {
    setActiveZone(zoneId);
    onZoneSelect(zoneId);
  }, [onZoneSelect]);

  return (
    <div className="relative border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950 shadow-2xl" role="region" aria-label="Interactive Stadium Map">
      {/* Dynamic Navigation Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-slate-900/95 p-3 rounded-xl border border-slate-800/80 backdrop-blur-md shadow-lg">
        <div className="grid grid-cols-3 gap-1.5">
          <div></div>
          <button 
            onClick={() => applyPan(0, -50)} 
            className="w-10 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg font-bold flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Pan Up"
          >
            ↑
          </button>
          <div></div>
          <button 
            onClick={() => applyPan(-50, 0)} 
            className="w-10 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg font-bold flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Pan Left"
          >
            ←
          </button>
          <button 
            onClick={resetView} 
            className="w-10 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg font-bold flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Reset View"
          >
            ↺
          </button>
          <button 
            onClick={() => applyPan(50, 0)} 
            className="w-10 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg font-bold flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Pan Right"
          >
            →
          </button>
          <div></div>
          <button 
            onClick={() => applyPan(0, 50)} 
            className="w-10 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg font-bold flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Pan Down"
          >
            ↓
          </button>
          <div></div>
        </div>
        <div className="h-[1px] bg-slate-800 my-1"></div>
        <div className="flex gap-1.5">
          <button 
            onClick={() => applyZoom(1.25)} 
            className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg font-bold flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Zoom In"
          >
            +
          </button>
          <button 
            onClick={() => applyZoom(0.8)} 
            className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg font-bold flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Zoom Out"
          >
            -
          </button>
        </div>
      </div>

      <svg 
        width="100%" 
        height="500px" 
        className="cursor-move"
        viewBox="0 0 800 600"
        aria-labelledby="stadium-map-title stadium-map-desc"
        role="group"
      >
        <title id="stadium-map-title">Interactive Venue Seating Map</title>
        <desc id="stadium-map-desc">
          Keyboard-navigable vector SVG mapping Zone A (West Concourse) and Zone B (East Concourse). Seating zones are selectable for crowd density calculation.
        </desc>
        <g transform={`matrix(${matrix.join(' ')})`}>
          {/* Main Stadium Outer Boundary */}
          <rect x="50" y="50" width="700" height="500" rx="100" fill="#1e293b" stroke="#334155" strokeWidth="8" />
          
          {/* Internal Seating Tier Backdrop */}
          <rect x="70" y="70" width="660" height="460" rx="80" fill="#0f172a" stroke="#1e293b" strokeWidth="4" />
          
          {/* Central Pitch / Playfield */}
          <rect x="250" y="200" width="300" height="200" fill="#064e3b" stroke="#059669" strokeWidth="4" />
          <line x1="400" y1="200" x2="400" y2="400" stroke="#059669" strokeWidth="4" />
          <circle cx="400" cy="300" r="50" fill="none" stroke="#059669" strokeWidth="4" />
          
          {/* Interactive Seating Zone A */}
          <path
            d="M 100 100 L 220 100 L 220 180 L 100 180 Z"
            fill={activeZone === 'ZoneA' ? '#2563eb' : '#334155'}
            fillOpacity={activeZone === 'ZoneA' ? '0.85' : '0.5'}
            stroke={activeZone === 'ZoneA' ? '#60a5fa' : '#475569'}
            strokeWidth="3"
            role="button"
            tabIndex={0}
            aria-label="Zone A Seating Section"
            aria-pressed={activeZone === 'ZoneA'}
            onClick={() => handleZoneInteraction('ZoneA')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleZoneInteraction('ZoneA'); } }}
            className="transition-all duration-200 cursor-pointer focus:outline-none focus:ring-4 focus:ring-blue-500"
          />
          <text x="160" y="145" fill="#f8fafc" textAnchor="middle" dominantBaseline="middle" className="font-bold pointer-events-none select-none">
            Zone A
          </text>

          {/* Interactive Seating Zone B */}
          <path
            d="M 580 100 L 700 100 L 700 180 L 580 180 Z"
            fill={activeZone === 'ZoneB' ? '#2563eb' : '#334155'}
            fillOpacity={activeZone === 'ZoneB' ? '0.85' : '0.5'}
            stroke={activeZone === 'ZoneB' ? '#60a5fa' : '#475569'}
            strokeWidth="3"
            role="button"
            tabIndex={0}
            aria-label="Zone B Seating Section"
            aria-pressed={activeZone === 'ZoneB'}
            onClick={() => handleZoneInteraction('ZoneB')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleZoneInteraction('ZoneB'); } }}
            className="transition-all duration-200 cursor-pointer focus:outline-none focus:ring-4 focus:ring-blue-500"
          />
          <text x="640" y="145" fill="#f8fafc" textAnchor="middle" dominantBaseline="middle" className="font-bold pointer-events-none select-none">
            Zone B
          </text>
        </g>
      </svg>
    </div>
  );
};

/** Memoised InteractiveMap — only re-renders when props change. */
export const InteractiveMap = memo(InteractiveMapInner);
