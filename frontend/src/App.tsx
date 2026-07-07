import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { InteractiveMap } from './components/InteractiveMap';
import { VoiceAssistant } from './components/VoiceAssistant';

interface CrowdMetrics {
  walking_velocity: number;
  flow_rate: number;
  congestion_index: number;
  safety_status: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/** Debounce delay for slider inputs to prevent API flooding (ms). */
const SLIDER_DEBOUNCE_MS = 300;

function App() {

  const [selectedDestination, setSelectedDestination] = useState<string>('');
  const [selectedZone, setSelectedZone] = useState<string>('ZoneA');
  const [apiResponse, setApiResponse] = useState<string>('');
  
  // Crowd metrics sliders state
  const [density, setDensity] = useState<number>(1.2);
  const [deviation, setDeviation] = useState<number>(0.15);
  const [acousticDb, setAcousticDb] = useState<number>(65);
  const [channelWidth, setChannelWidth] = useState<number>(3.5);
  
  const [metrics, setMetrics] = useState<CrowdMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // RAG interface state
  const [queryText, setQueryText] = useState<string>('Where is the nearest exit?');
  const [userRole, setUserRole] = useState<string>('fan');
  const [ragStatus, setRagStatus] = useState<string>('');
  const [ragLoading, setRagLoading] = useState<boolean>(false);

  // Debounce timer ref — avoids firing API calls on every slider tick
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRouteTriggered = useCallback((target: string) => {
    setSelectedDestination(target);
    setQueryText(target); // Populate transcript into query text field
    if (target.includes('zone a') || target.includes('section a')) {
      setSelectedZone('ZoneA');
    } else if (target.includes('zone b') || target.includes('section b')) {
      setSelectedZone('ZoneB');
    }
  }, []);

  const handleZoneSelect = useCallback((zoneId: string) => {
    setSelectedZone(zoneId);
  }, []);

  // Core fetch logic extracted for reuse by debouncer
  const fetchCrowdMetrics = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/operations/calculate-congestion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          density,
          velocity_deviation: deviation,
          acoustic_db: acousticDb,
          channel_width: channelWidth
        })
      });
      if (!response.ok) {
        throw new Error('Failed to fetch crowd safety metrics.');
      }
      const data = await response.json();
      setMetrics(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error communicating with backend.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }, [density, deviation, acousticDb, channelWidth]);

  // Debounced effect — waits SLIDER_DEBOUNCE_MS after last param change
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchCrowdMetrics();
    }, SLIDER_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [fetchCrowdMetrics]);

  // Handle custom interactive queries to the RAG backend
  const handleRAGQuerySubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!queryText.trim()) return;

    setRagLoading(true);
    setApiResponse('');
    setRagStatus('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/operations/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query_text: queryText,
          user_role: userRole
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        setApiResponse(data.grounded_answer);
        setRagStatus(data.status);
      } else {
        setApiResponse(data.detail || 'Access denied by system guardrails.');
        setRagStatus('forbidden');
      }
    } catch (error) {
      console.error('RAG connection error:', error);
      setApiResponse('Error connecting to backend RAG engine.');
      setRagStatus('error');
    } finally {
      setRagLoading(false);
    }
  }, [queryText, userRole]);

  // Memoised protocol extraction — avoids recomputation on unrelated renders
  const { protocolText, displayResponse } = useMemo(() => {
    const match = apiResponse.match(/Protocol:\s*(.*)/);
    const protocol = match ? match[1] : null;
    const display = protocol
      ? apiResponse.replace(/Protocol:\s*(.*)/, '').trim()
      : apiResponse;
    return { protocolText: protocol, displayResponse: display };
  }, [apiResponse]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-8 font-sans">
      <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            ArenaOS Operations
          </h1>
          <p className="text-slate-400 mt-2 text-sm md:text-base">
            Centralized Algorithmic Security, Crowd Dynamics & AI Dispatch Hub
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-sm font-semibold text-emerald-400 tracking-wide uppercase">System Operational</span>
        </div>
      </header>

      {/* Dispatch Banners */}
      {metrics && metrics.safety_status !== 'SAFE' && (
        <div 
          className={`mb-8 p-5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in ${
            metrics.safety_status === 'CRITICAL' 
              ? 'bg-rose-950/70 border-rose-800/80 text-rose-200' 
              : 'bg-amber-950/70 border-amber-800/80 text-amber-200'
          }`}
          role="alert"
          aria-live="assertive"
        >
          <div>
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-sm">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Generative AI Dispersion Dispatch ({metrics.safety_status})
            </div>
            <p className="mt-2 text-sm md:text-base font-medium">
              {metrics.safety_status === 'CRITICAL'
                ? `CRITICAL CONGESTION in ${selectedZone}. Automated dispersion protocols activated. Localized signage changed: Directing spectators to Alternate Gate C. Exits A & B are currently locked due to bottleneck flow rate Q=${metrics.flow_rate} pax/s.`
                : `WARNING: Approaching density thresholds in ${selectedZone}. Micro-promotions sent to mobile apps for concessions at South Concourse to distribute crowd pressures.`}
            </p>
          </div>
        </div>
      )}

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Map Section */}
        <section className="lg:col-span-2 flex flex-col gap-6" aria-label="Stadium Layout">
          <div className="bg-slate-800/40 border border-slate-800/80 rounded-xl p-5 shadow-xl backdrop-blur-md">
            <h2 className="text-xl font-bold text-white mb-3">Live Interactive Venue Twin</h2>
            <InteractiveMap 
              selectedDestination={selectedDestination} 
              onZoneSelect={handleZoneSelect} 
            />
            <p className="mt-3 text-xs text-slate-400">
              * Map is rendered as keyboard-navigable inline vector SVG. Click seating sections or use keyboard to inspect zone properties.
            </p>
          </div>

          {/* Crowd Dynamics Sliders */}
          <div className="bg-slate-800/40 border border-slate-800/80 rounded-xl p-6 shadow-xl backdrop-blur-md">
            <h3 className="text-xl font-bold text-white mb-4">Quantify Crowd Dynamics ({selectedZone})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="density-slider" className="block text-sm font-semibold text-slate-300 mb-2">
                  Crowd Density (&rho;): <span className="text-blue-400 font-bold">{density} people/m²</span>
                </label>
                <input 
                  id="density-slider"
                  type="range" 
                  min="0.0" 
                  max="5.0" 
                  step="0.1" 
                  value={density} 
                  onChange={(e) => setDensity(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-xs text-slate-400 mt-1 block">Determines Walking Velocity (v)</span>
              </div>

              <div>
                <label htmlFor="deviation-slider" className="block text-sm font-semibold text-slate-300 mb-2">
                  Velocity Vector Deviation (&delta;v): <span className="text-blue-400 font-bold">{deviation}</span>
                </label>
                <input 
                  id="deviation-slider"
                  type="range" 
                  min="0.0" 
                  max="1.0" 
                  step="0.05" 
                  value={deviation} 
                  onChange={(e) => setDeviation(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-xs text-slate-400 mt-1 block">Measures structural crowd deviation</span>
              </div>

              <div>
                <label htmlFor="decibel-slider" className="block text-sm font-semibold text-slate-300 mb-2">
                  Acoustic Amplitude (&alpha;d): <span className="text-blue-400 font-bold">{acousticDb} dB</span>
                </label>
                <input 
                  id="decibel-slider"
                  type="range" 
                  min="30" 
                  max="120" 
                  step="1" 
                  value={acousticDb} 
                  onChange={(e) => setAcousticDb(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-xs text-slate-400 mt-1 block">Acoustic variations from security mics</span>
              </div>

              <div>
                <label htmlFor="width-slider" className="block text-sm font-semibold text-slate-300 mb-2">
                  Effective Exit Width (W): <span className="text-blue-400 font-bold">{channelWidth} meters</span>
                </label>
                <input 
                  id="width-slider"
                  type="range" 
                  min="1.0" 
                  max="10.0" 
                  step="0.5" 
                  value={channelWidth} 
                  onChange={(e) => setChannelWidth(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-xs text-slate-400 mt-1 block">Width of exit tunnels for flow calculations</span>
              </div>
            </div>
          </div>
        </section>

        {/* Sidebar Controls */}
        <section className="flex flex-col gap-6" aria-label="System Dashboard">
          {/* Metrics Outputs */}
          <div className="bg-slate-800/40 border border-slate-800/80 rounded-xl p-6 shadow-xl backdrop-blur-md">
            <h3 className="text-xl font-bold text-white mb-4">Calculated Safety Metrics</h3>
            {loading && <p className="text-slate-400 text-sm">Calculating...</p>}
            {errorMsg && <p className="text-rose-400 text-sm">{errorMsg}</p>}
            {metrics && !loading && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                  <span className="text-sm text-slate-400">Congestion Index (C)</span>
                  <div className="flex flex-col items-end">
                    <span className={`text-lg font-extrabold ${
                      metrics.safety_status === 'CRITICAL' ? 'text-rose-500' :
                      metrics.safety_status === 'WARNING' ? 'text-amber-500' : 'text-emerald-500'
                    }`}>
                      {metrics.congestion_index}
                    </span>
                    <span className="text-xs text-slate-400 uppercase font-semibold">{metrics.safety_status}</span>
                  </div>
                </div>

                <div className="w-full bg-slate-700 rounded-full h-2.5">
                  <div 
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      metrics.safety_status === 'CRITICAL' ? 'bg-rose-500' :
                      metrics.safety_status === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${metrics.congestion_index * 100}%` }}
                  ></div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                    <span className="block text-xs text-slate-400">Mean Velocity (v)</span>
                    <span className="text-lg font-bold text-white">{metrics.walking_velocity} m/s</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                    <span className="block text-xs text-slate-400">Flow Rate (Q)</span>
                    <span className="text-lg font-bold text-white">{metrics.flow_rate} pax/s</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <VoiceAssistant onRouteTriggered={handleRouteTriggered} />
          
          {/* Enhanced RAG Assistant Interface (Accessibility & Problem Statement Alignment) */}
          <div className="bg-slate-800/40 border border-slate-800/80 rounded-xl p-6 shadow-xl backdrop-blur-md" role="region" aria-label="Command Operations">
            <h3 className="text-xl font-bold text-white mb-2">RAG Operations Guard</h3>
            <p className="text-xs text-slate-400 mb-4">Validate query parameters through deterministic system guardrails.</p>
            
            <form onSubmit={handleRAGQuerySubmit} className="space-y-4">
              <div>
                <label htmlFor="user-role-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Authorized Role
                </label>
                <select
                  id="user-role-select"
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="fan">Fan (Public Access)</option>
                  <option value="staff">Staff (Operations)</option>
                  <option value="volunteer">Volunteer (Support)</option>
                </select>
              </div>

              <div>
                <label htmlFor="rag-query-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Security Query
                </label>
                <input
                  id="rag-query-input"
                  type="text"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ask a security procedure..."
                  maxLength={512}
                  required
                />
              </div>

              <div className="flex gap-4 text-xs text-slate-400">
                <p><strong>Zone Context:</strong> {selectedZone}</p>
                {selectedDestination && <p><strong>Voice Sync:</strong> Active</p>}
              </div>

              <button 
                type="submit"
                disabled={ragLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md"
              >
                {ragLoading ? 'Querying RAG Engine...' : 'Run Safety Query'}
              </button>
            </form>

            {/* Results Callouts */}
            {apiResponse && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-xs uppercase font-bold tracking-wide">
                  <span className="text-slate-400">Safety Status</span>
                  {ragStatus === 'success' && (
                    <span className="text-emerald-400 px-2 py-0.5 bg-emerald-950/60 border border-emerald-800/80 rounded">
                      Grounded / Success
                    </span>
                  )}
                  {ragStatus === 'unresolved' && (
                    <span className="text-amber-400 px-2 py-0.5 bg-amber-950/60 border border-amber-800/80 rounded">
                      Unresolved
                    </span>
                  )}
                  {ragStatus === 'forbidden' && (
                    <span className="text-rose-400 px-2 py-0.5 bg-rose-950/60 border border-rose-800/80 rounded animate-pulse">
                      Security Alert / Forbidden
                    </span>
                  )}
                  {(ragStatus === 'error' || ragStatus === '') && (
                    <span className="text-slate-400 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded">
                      System Idle / Error
                    </span>
                  )}
                </div>
                
                <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-lg text-sm text-slate-300">
                  <strong className="block text-slate-200 text-xs mb-1 uppercase tracking-wider">Engine Response:</strong>
                  {displayResponse}

                  {protocolText && (
                    <div className="mt-3 p-3 bg-blue-950/40 border border-blue-900/60 rounded-lg text-xs text-blue-200">
                      <strong className="block text-blue-400 mb-1">Grounded Reference:</strong>
                      {protocolText}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
