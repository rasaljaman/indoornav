import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import QRScanner from '../../components/scanner/QRScanner';
import VisitorMap from '../../components/map/VisitorMap';
import { findShortestPath, findClosestNodeToRoom } from '../../lib/pathfinding';
import { PositionTracker } from '../../lib/positioning';
import { 
  loadOrgDataOfflineFirst, 
  findNodeInOrgData, 
  findNodeByQrInOrgData, 
  getFloorDataFromOrgData, 
  listenNetworkStatus 
} from '../../lib/offlineCache';
import { 
  Search, 
  MapPin, 
  Navigation, 
  Compass, 
  Footprints, 
  RotateCcw, 
  RotateCw, 
  CheckCircle2, 
  Sliders,
  Wifi,
  WifiOff,
  RefreshCw,
  Layers
} from 'lucide-react';

export default function OrgVisitorPage() {
  const { orgSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [org, setOrg] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isNoCacheOffline, setIsNoCacheOffline] = useState(false);
  
  // Offline Data Bundle (Phase 5)
  const [orgData, setOrgData] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isFromCache, setIsFromCache] = useState(false);

  // Active Floor & Map Data
  const [activeFloorId, setActiveFloorId] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  
  // Search and Routing State
  const [searchQuery, setSearchQuery] = useState('');
  const [destinationRoom, setDestinationRoom] = useState(null);
  const [activePath, setActivePath] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [hasArrived, setHasArrived] = useState(false);

  // Live Mobile Tracking State (Phase 4)
  const [liveLocation, setLiveLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [stepLength, setStepLength] = useState(0.7);

  // PositionTracker instance reference
  const trackerRef = useRef(null);

  // 1. Subscribe to online/offline network changes
  useEffect(() => {
    const unsubscribe = listenNetworkStatus((online) => {
      setIsOnline(online);
    });
    return () => unsubscribe();
  }, []);

  // 2. Initialize PositionTracker on mount
  useEffect(() => {
    const tracker = new PositionTracker({
      stepLengthMeters: stepLength,
      debounceMs: 300,
      compassPullFactor: 0.01
    });

    const unsubscribe = tracker.onUpdate((pos) => {
      setLiveLocation({ ...pos });
    });

    trackerRef.current = tracker;

    // Check if iOS requires user permission
    if (PositionTracker.isPermissionNeeded()) {
      setShowPermissionPrompt(true);
    } else {
      tracker.start();
      setIsTracking(true);
    }

    return () => {
      unsubscribe();
      tracker.stop();
    };
  }, []);

  // Update tracker step length when adjusted
  useEffect(() => {
    if (trackerRef.current) {
      trackerRef.current.setStepLength(stepLength);
    }
  }, [stepLength]);

  // Request iOS permission on user tap
  const handleRequestPermission = async () => {
    const res = await PositionTracker.requestPermission();
    if (res.granted) {
      setShowPermissionPrompt(false);
      if (trackerRef.current) {
        trackerRef.current.start();
        setIsTracking(true);
      }
    } else {
      alert("Motion sensors are needed to follow your live walking position.");
    }
  };

  // 3. Resolve location from bundle
  const resolveLocation = useCallback((bundle, locId) => {
    if (!bundle || !locId) return;
    const node = findNodeInOrgData(bundle, locId);
    if (node) {
      setCurrentLocation(node);
      setActiveFloorId(node.floor_id);

      // Silent re-anchoring: reset drift immediately without visual jump
      if (trackerRef.current) {
        trackerRef.current.reanchor(node.x, node.y);
      }
    }
  }, []);

  // 4. Load Organization Data (Offline-First)
  const loadData = useCallback(async () => {
    setLoading(true);
    setIsNoCacheOffline(false);
    setNotFound(false);

    try {
      const res = await loadOrgDataOfflineFirst(orgSlug, supabase);

      if (res.error === 'NO_OFFLINE_CACHE') {
        setIsNoCacheOffline(true);
        setLoading(false);
        return;
      }

      const bundle = res.data;
      if (!bundle || !bundle.org) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setOrgData(bundle);
      setOrg(bundle.org);
      setBuildings(bundle.buildings || []);
      setIsFromCache(res.fromCache);

      // Check for URL location parameter
      const loc = searchParams.get('loc');
      if (loc) {
        resolveLocation(bundle, loc);
      } else if (bundle.floors && bundle.floors.length > 0) {
        // Auto-select first floor if not set
        setActiveFloorId(bundle.floors[0].id);
      }
    } catch (err) {
      console.error("Error loading org data:", err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, searchParams, resolveLocation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 5. Load Map Data whenever activeFloorId or orgData changes
  useEffect(() => {
    if (activeFloorId && orgData) {
      const floorBundle = getFloorDataFromOrgData(orgData, activeFloorId);
      if (floorBundle) {
        setMapData(floorBundle);

        // Update corridor graph in the position tracker
        if (trackerRef.current) {
          trackerRef.current.updateGraph(floorBundle.nodes, floorBundle.edges);
          if (floorBundle.floor?.real_width_m && floorBundle.floor?.map_width) {
            const ppm = floorBundle.floor.map_width / floorBundle.floor.real_width_m;
            trackerRef.current.setPixelsPerMeter(ppm);
          }
        }
      }
    }
  }, [activeFloorId, orgData]);

  // 6. Handle Routing
  useEffect(() => {
    if (currentLocation && destinationRoom && mapData) {
      if (currentLocation.floor_id !== destinationRoom.floor_id) {
        alert("Multi-floor routing is coming soon! For now, destination must be on the same floor.");
        setActivePath([]);
        return;
      }

      const destNode = findClosestNodeToRoom(destinationRoom, mapData.nodes);
      if (destNode) {
        const path = findShortestPath(currentLocation.id, destNode.id, mapData.nodes, mapData.edges);
        if (path) {
          setActivePath(path);
          setHasArrived(false);
        } else {
          alert("No path could be found to that destination.");
        }
      }
    }
  }, [destinationRoom, currentLocation, mapData]);

  // 7. Check for destination arrival
  useEffect(() => {
    if (destinationRoom && liveLocation && mapData) {
      const destNode = findClosestNodeToRoom(destinationRoom, mapData.nodes);
      if (destNode) {
        const dist = Math.hypot(liveLocation.x - destNode.x, liveLocation.y - destNode.y);
        // If within ~28px (~0.8m), arrived!
        if (dist < 28 && !hasArrived) {
          setHasArrived(true);
        }
      }
    }
  }, [liveLocation, destinationRoom, mapData, hasArrived]);

  const orgTypeIcon = {
    college: '🎓',
    hospital: '🏥',
    mall: '🛍️',
    other: '🏢',
  };

  // Re-anchoring upon QR Scan (Offline-capable)
  const handleScanSuccess = async (decodedText) => {
    setShowScanner(false);
    try {
      // 1. Check local cached nodes/QR data first
      let node = findNodeByQrInOrgData(orgData, decodedText);

      // 2. If not matched, try URL loc query param
      if (!node) {
        try {
          const url = new URL(decodedText);
          const loc = url.searchParams.get('loc');
          if (loc) {
            setSearchParams({ loc });
            node = findNodeInOrgData(orgData, loc);
          }
        } catch {
          // Not a URL
        }
      }

      // 3. Fallback to Supabase if online and not in local cache
      if (!node && isOnline && supabase) {
        try {
          const url = new URL(decodedText);
          const loc = url.searchParams.get('loc');
          if (loc) {
            const { data: remoteNode } = await supabase
              .from('nodes')
              .select('*, floors(name, building_id, map_width, real_width_m)')
              .eq('id', loc)
              .single();
            node = remoteNode;
          }
        } catch {
          // Ignore
        }
      }

      if (node) {
        setCurrentLocation(node);
        setActiveFloorId(node.floor_id);

        // Silent re-anchoring: snap to node coordinates and reset drift
        if (trackerRef.current) {
          trackerRef.current.reanchor(node.x, node.y);
        }
      } else {
        alert("Node not found for this QR code in the downloaded map.");
      }
    } catch (e) {
      console.warn("QR scan issue:", e);
      alert("Invalid QR format. Expected an IndoorNav QR code.");
    }
  };

  // Loading State
  if (loading) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div className="animate-pulse-slow" style={{ color: 'var(--color-text-secondary)' }}>
          Loading map...
        </div>
      </div>
    );
  }

  // Graceful Degradation: First-time load offline with no cache
  if (isNoCacheOffline) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div className="glass-card animate-slide-up" style={{
          padding: '48px',
          textAlign: 'center',
          maxWidth: '480px',
          border: '1px solid rgba(245, 158, 11, 0.4)',
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            margin: '0 auto 16px',
            borderRadius: '20px',
            background: 'rgba(245, 158, 11, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.2rem',
            color: '#F59E0B'
          }}>
            📡
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>
            Connection Required for First Visit
          </h2>
          <p style={{
            color: 'var(--color-text-secondary)',
            marginBottom: '24px',
            fontSize: '0.95rem',
            lineHeight: 1.6
          }}>
            You are currently offline. IndoorNav needs an internet connection once to download and cache the indoor map for <strong>"{orgSlug}"</strong>. Once downloaded, all maps, search, and live tracking will work completely offline!
          </p>
          <button 
            onClick={loadData}
            className="btn-primary" 
            style={{ padding: '12px 28px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={18} /> Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Not Found State
  if (notFound) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div className="glass-card animate-slide-up" style={{
          padding: '48px',
          textAlign: 'center',
          maxWidth: '450px',
        }}>
          <p style={{ fontSize: '3rem', marginBottom: '16px' }}>🔍</p>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>
            Organization Not Found
          </h2>
          <p style={{
            color: 'var(--color-text-secondary)',
            marginBottom: '24px',
          }}>
            The organization "{orgSlug}" doesn't exist or hasn't been set up yet.
          </p>
          <Link to="/" className="btn-primary" style={{ padding: '10px 24px' }}>
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="gradient-bg" />

      {showScanner && (
        <QRScanner 
          onScanSuccess={handleScanSuccess}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="page-container animate-fade-in">
        {/* Org Header & Network Status Indicator */}
        <div style={{
          textAlign: 'center',
          padding: '40px 0 20px',
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            margin: '0 auto 16px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
          }}>
            {orgTypeIcon[org.type] || '🏢'}
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '4px' }}>
            {org.name}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', textTransform: 'capitalize', marginBottom: '12px' }}>
            {org.type} Navigation
          </p>

          {/* Phase 5: Subtle Non-Intrusive Offline / Online Indicator Badge */}
          <div className="flex items-center justify-center">
            {!isOnline ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                <WifiOff size={13} />
                <span>Offline Mode (Cached Map)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                <Wifi size={13} />
                <span>{isFromCache ? 'Online • Map Cached' : 'Online'}</span>
              </span>
            )}
          </div>
        </div>

        {/* iOS Motion Permission Prompt UI */}
        {showPermissionPrompt && (
          <div className="glass-card border border-blue-500/40 p-4 mb-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-slide-up shadow-xl bg-gradient-to-r from-blue-900/30 to-indigo-900/30 max-w-2xl mx-auto">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-xl flex-shrink-0">
                🧭
              </div>
              <div>
                <div className="font-semibold text-white">Enable motion tracking to follow your position</div>
                <div className="text-xs text-blue-200/70">iOS requires tap permission to detect walking steps and compass heading</div>
              </div>
            </div>
            <button
              onClick={handleRequestPermission}
              className="btn-primary whitespace-nowrap px-5 py-2 text-sm font-medium rounded-xl shadow-lg"
            >
              Enable Tracking
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}>
          <button 
            onClick={() => setShowScanner(true)}
            className="btn-primary" 
            style={{ padding: '14px 28px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <MapPin size={20} /> Scan QR to Start
          </button>
          {mapData && (
            <button 
              onClick={() => setShowSearch(!showSearch)}
              className="btn-secondary" 
              style={{ padding: '14px 28px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Search size={20} /> Search for a Room
            </button>
          )}
        </div>

        {/* Current Location Alert & Live Telemetry Bar */}
        {currentLocation && (
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 mb-6 text-center animate-slide-up flex flex-col items-center justify-center max-w-3xl mx-auto shadow-xl">
            <div className="flex items-center text-green-400 font-medium">
              <MapPin className="mr-2" size={18} />
              <span>You are at <strong>Node {currentLocation.id.substring(0,8)}</strong> on <strong>{currentLocation.floors?.name}</strong></span>
            </div>

            {/* Live Tracking Telemetry Bar */}
            <div className="flex flex-wrap items-center justify-center gap-4 mt-3 text-xs text-gray-300 bg-black/30 px-4 py-2 rounded-full border border-white/5">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isTracking ? 'bg-blue-500 animate-pulse' : 'bg-gray-500'}`}></span>
                <span className={`${isTracking ? 'text-blue-400' : 'text-gray-400'} font-medium`}>
                  {isTracking ? 'Live Tracking Active' : 'Sensors Idle'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Footprints size={14} className="text-gray-400" />
                <span>Steps: <strong>{liveLocation?.stepCount || 0}</strong></span>
              </div>
              <div className="flex items-center gap-1">
                <Compass size={14} className="text-gray-400" />
                <span>Heading: <strong>{Math.round(liveLocation?.heading || 0)}°</strong></span>
              </div>
              <button
                onClick={() => setShowSimulator(s => !s)}
                className="text-blue-400 hover:text-blue-300 underline ml-2 flex items-center gap-1"
              >
                <Sliders size={12} /> {showSimulator ? "Hide Walk Test" : "Walk Simulator"}
              </button>
            </div>

            {/* Desktop / Manual Walk Simulator Panel */}
            {showSimulator && (
              <div className="mt-3 p-3 bg-black/40 rounded-xl border border-white/10 w-full max-w-md animate-fade-in flex flex-col gap-2">
                <div className="text-xs text-gray-400 flex justify-between items-center">
                  <span>Step Simulator (Desktop Testing)</span>
                  <div className="flex items-center gap-1">
                    <span>Stride:</span>
                    <select
                      value={stepLength}
                      onChange={(e) => setStepLength(parseFloat(e.target.value))}
                      className="bg-black/60 border border-white/20 rounded px-1 text-white text-xs"
                    >
                      <option value="0.5">0.5m</option>
                      <option value="0.7">0.7m</option>
                      <option value="0.9">0.9m</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => trackerRef.current?.simulateTurn(-45)}
                    className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1"
                    title="Turn Left 45°"
                  >
                    <RotateCcw size={14} /> Turn -45°
                  </button>
                  <button
                    onClick={() => trackerRef.current?.simulateStep()}
                    className="btn-primary px-4 py-1.5 text-xs flex items-center gap-1.5 font-bold"
                    title="Simulate Step Forward"
                  >
                    <Footprints size={14} /> Step Forward
                  </button>
                  <button
                    onClick={() => trackerRef.current?.simulateTurn(45)}
                    className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1"
                    title="Turn Right 45°"
                  >
                    Turn +45° <RotateCw size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Destination & Arrival Badge */}
            {destinationRoom && (
              <div className="mt-3 text-blue-400 flex flex-wrap items-center justify-center gap-2">
                <div className="flex items-center">
                  <Navigation className="mr-1.5" size={16} />
                  Routing to <strong>{destinationRoom.name}</strong>
                </div>
                {hasArrived ? (
                  <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2.5 py-1 rounded-full font-semibold animate-pulse">
                    <CheckCircle2 size={13} /> You have arrived!
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">
                    (Follow glowing path)
                  </span>
                )}
                <button 
                  onClick={() => { setDestinationRoom(null); setActivePath([]); setHasArrived(false); }}
                  className="text-xs bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition-colors ml-2"
                >
                  Clear Route
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search Overlay */}
        {showSearch && mapData && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-6 border border-white/20 animate-fade-in max-w-2xl mx-auto shadow-2xl">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search for a room, department, or facility..."
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {searchQuery && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl bg-black/40 border border-white/10">
                {mapData.rooms
                  .filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(room => (
                    <button
                      key={room.id}
                      onClick={() => {
                        setDestinationRoom(room);
                        setShowSearch(false);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/10 border-b border-white/5 last:border-0 transition-colors"
                    >
                      <div className="font-medium text-white">{room.name}</div>
                      <div className="text-xs text-gray-400 capitalize">{room.category}</div>
                    </button>
                  ))}
                {mapData.rooms.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                  <div className="p-4 text-gray-400 text-center">No rooms found.</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Floor Selection Bar (if organization has multiple floors) */}
        {orgData?.floors && orgData.floors.length > 1 && (
          <div className="flex items-center justify-center gap-2 mb-4">
            <Layers size={16} className="text-gray-400" />
            <span className="text-xs text-gray-400 font-medium mr-1">Floor:</span>
            {orgData.floors.map(floor => (
              <button
                key={floor.id}
                onClick={() => setActiveFloorId(floor.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  activeFloorId === floor.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {floor.name}
              </button>
            ))}
          </div>
        )}

        {/* Visitor Map or Buildings Placeholder */}
        {activeFloorId && mapData ? (
          <div className="animate-fade-in mt-4">
            <h2 className="text-xl font-bold mb-4 text-center">{mapData.floor?.name}</h2>
            <VisitorMap 
              rooms={mapData.rooms}
              nodes={mapData.nodes}
              edges={mapData.edges}
              currentLocationNodeId={currentLocation?.id}
              liveLocation={liveLocation}
              path={activePath}
            />
          </div>
        ) : (
          <>
            {buildings.length === 0 ? (
              <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
                <p style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🏗️</p>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.05rem' }}>
                  Maps are being prepared for this organization.
                  <br />Check back soon!
                </p>
              </div>
            ) : (
              <>
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  marginBottom: '16px',
                  textAlign: 'center',
                }}>
                  Please scan a QR code on a wall to see the map.
                </h2>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '16px',
                  maxWidth: '800px',
                  margin: '0 auto',
                }}>
                  {buildings.map(building => (
                    <div key={building.id} className="glass-card opacity-50" style={{
                      padding: '24px',
                      textAlign: 'center',
                    }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '52px',
                        height: '52px',
                        borderRadius: '14px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        fontSize: '1.5rem',
                        marginBottom: '12px',
                      }}>
                        🏢
                      </span>
                      <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>{building.name}</h3>
                      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                        Waiting for location lock...
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
