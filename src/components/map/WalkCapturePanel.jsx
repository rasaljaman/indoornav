import { useState, useEffect, useRef } from 'react';
import {
  Footprints,
  Compass,
  MapPin,
  Check,
  X,
  RotateCcw,
  RotateCw,
  Plus,
  Square,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  Sliders,
} from 'lucide-react';
import { PositionTracker, applyLinearDriftCorrection } from '../../lib/positioning';

const NODE_TYPES = [
  { id: 'junction', label: 'Junction', color: '#1A73E8', letter: 'J' },
  { id: 'room_door', label: 'Door', color: '#10B981', letter: 'D' },
  { id: 'stairs', label: 'Stairs', color: '#F97316', letter: 'S' },
  { id: 'entrance', label: 'Entrance', color: '#EF4444', letter: 'E' },
];

export default function WalkCapturePanel({
  active = false,
  startAnchor = null,
  facingAngle = 0,
  onSetFacingAngle,
  pixelsPerMeter = 35,
  existingNodes = [],
  onCommitPath,
  onCancel,
  onUpdateTrail,
}) {
  // Capture Phase: 'setup' | 'walking' | 'review'
  const [phase, setPhase] = useState('setup');

  // Selected node type for newly dropped waypoints
  const [selectedNodeType, setSelectedNodeType] = useState('junction');

  // Telemetry & Sensor Tracking State
  const [stepCount, setStepCount] = useState(0);
  const [currentPos, setCurrentPos] = useState(null);
  const [currentHeading, setCurrentHeading] = useState(0);
  const [compassHeading, setCompassHeading] = useState(0);
  const [trailPoints, setTrailPoints] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [stepLengthMeters, setStepLengthMeters] = useState(0.7);

  // Review & Drift Correction State
  const [snapCandidate, setSnapCandidate] = useState(null);
  const [useDriftCorrection, setUseDriftCorrection] = useState(true);
  const [driftStats, setDriftStats] = useState(null);
  const [correctedData, setCorrectedData] = useState(null);

  // Reference to PositionTracker instance
  const trackerRef = useRef(null);

  // 1. Initialize tracker on mount
  useEffect(() => {
    const tracker = new PositionTracker({
      stepLengthMeters: stepLengthMeters,
      pixelsPerMeter: pixelsPerMeter,
      stepThreshold: 1.3,
      debounceMs: 280,
    });

    const unsubscribe = tracker.onUpdate((state) => {
      setCurrentHeading(state.heading);
      setCompassHeading(state.compassHeading);

      // Only advance position if currently walking
      if (phase === 'walking') {
        setStepCount(state.stepCount);
        const pt = { x: Math.round(state.rawX * 10) / 10, y: Math.round(state.rawY * 10) / 10 };
        setCurrentPos(pt);
        setTrailPoints((prev) => {
          const updated = [...prev, pt];
          if (onUpdateTrail) onUpdateTrail(updated, waypoints, pt, state.heading);
          return updated;
        });
      }
    });

    trackerRef.current = tracker;

    return () => {
      tracker.stop();
      unsubscribe();
    };
  }, [pixelsPerMeter, stepLengthMeters]);

  // Update pixels per meter if scale changes
  useEffect(() => {
    if (trackerRef.current) {
      trackerRef.current.setPixelsPerMeter(pixelsPerMeter);
    }
  }, [pixelsPerMeter]);

  // Sync start anchor to tracker
  useEffect(() => {
    if (startAnchor && trackerRef.current) {
      trackerRef.current.reanchor(startAnchor.x, startAnchor.y);
      setCurrentPos({ x: startAnchor.x, y: startAnchor.y });
      setTrailPoints([{ x: startAnchor.x, y: startAnchor.y }]);
    }
  }, [startAnchor]);

  // Sync full capture state (phase, waypoints, trail, drift correction) with parent
  useEffect(() => {
    if (onUpdateTrail) {
      onUpdateTrail(
        trailPoints,
        waypoints,
        currentPos,
        currentHeading,
        {
          phase,
          correctedData,
          snappedEndNode: snapCandidate?.node || null,
          useDriftCorrection,
        }
      );
    }
  }, [phase, correctedData, snapCandidate, useDriftCorrection, waypoints, trailPoints, currentPos, currentHeading]);

  // 2. Start Walking Handler
  const handleStartWalking = async () => {
    if (!startAnchor) return;

    // Check iOS permission if required
    if (PositionTracker.isPermissionNeeded()) {
      const perm = await PositionTracker.requestPermission();
      if (!perm.granted) {
        alert('Motion & orientation sensor permissions are required for live corridor walking capture.');
        return;
      }
    }

    if (trackerRef.current) {
      // Re-anchor at start coordinate with initial facing angle
      trackerRef.current.reset(startAnchor.x, startAnchor.y, facingAngle);
      trackerRef.current.start();
    }

    // Initialize first waypoint at start anchor
    const firstWp = {
      id: `wp-${Date.now()}-start`,
      x: startAnchor.x,
      y: startAnchor.y,
      type: startAnchor.type || 'junction',
      isAnchor: true,
    };

    setWaypoints([firstWp]);
    setTrailPoints([{ x: startAnchor.x, y: startAnchor.y }]);
    setStepCount(0);
    setPhase('walking');

    if (onUpdateTrail) {
      onUpdateTrail([{ x: startAnchor.x, y: startAnchor.y }], [firstWp], startAnchor, facingAngle);
    }
  };

  // 3. Drop Waypoint Handler (Large thumb button)
  const handleDropWaypoint = () => {
    if (!currentPos) return;

    if (navigator.vibrate) {
      navigator.vibrate(40);
    }

    const newWp = {
      id: `wp-${Date.now()}-${waypoints.length + 1}`,
      x: currentPos.x,
      y: currentPos.y,
      type: selectedNodeType,
    };

    const updatedWps = [...waypoints, newWp];
    setWaypoints(updatedWps);

    if (onUpdateTrail) {
      onUpdateTrail(trailPoints, updatedWps, currentPos, currentHeading);
    }
  };

  // 4. Finish Walking Handler
  const handleFinishWalking = () => {
    if (trackerRef.current) {
      trackerRef.current.stop();
    }

    // If final point hasn't been saved as waypoint, drop it
    let finalWps = [...waypoints];
    if (currentPos && (finalWps.length === 0 || finalWps[finalWps.length - 1].x !== currentPos.x || finalWps[finalWps.length - 1].y !== currentPos.y)) {
      finalWps.push({
        id: `wp-${Date.now()}-end`,
        x: currentPos.x,
        y: currentPos.y,
        type: selectedNodeType,
        isEnd: true,
      });
      setWaypoints(finalWps);
    }

    // Check if endpoint is near an existing node
    const endPoint = currentPos || (trailPoints.length > 0 ? trailPoints[trailPoints.length - 1] : startAnchor);
    let nearestNode = null;
    let nearestDist = Infinity;

    // Search existing nodes (ignoring start anchor if it was an existing node)
    (existingNodes || []).forEach((node) => {
      if (startAnchor?.nodeId && node.id === startAnchor.nodeId) return;
      const d = Math.hypot(node.x - endPoint.x, node.y - endPoint.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestNode = node;
      }
    });

    // Snap threshold: ~50 pixels (~0.6m - 1.2m depending on scale)
    const snapThresholdPx = 50;
    if (nearestNode && nearestDist <= snapThresholdPx) {
      setSnapCandidate({
        node: nearestNode,
        distanceMeters: Math.round((nearestDist / (pixelsPerMeter || 1)) * 10) / 10,
      });

      // Calculate linear drift correction
      const correction = applyLinearDriftCorrection(
        startAnchor,
        { x: nearestNode.x, y: nearestNode.y },
        trailPoints,
        finalWps
      );
      setCorrectedData(correction);
      setDriftStats({
        scaleFactor: correction.scaleFactor,
        rotationDegrees: correction.rotationDegrees,
        snapDistancePx: Math.round(nearestDist),
      });
      setUseDriftCorrection(true);
    } else {
      setSnapCandidate(null);
      setUseDriftCorrection(false);
      setCorrectedData(null);
      setDriftStats(null);
    }

    setPhase('review');
  };

  // 5. Commit Path Handler
  const handleCommit = () => {
    const activeWaypoints = useDriftCorrection && correctedData
      ? correctedData.correctedWaypoints
      : waypoints;

    if (onCommitPath) {
      onCommitPath({
        waypoints: activeWaypoints,
        rawTrail: trailPoints,
        correctedTrail: correctedData?.correctedTrail || null,
        snappedEndNode: useDriftCorrection ? snapCandidate?.node : null,
        startAnchor,
      });
    }
  };

  // 6. Simulator Helpers (for desktop / manual testing)
  const handleSimulateStep = () => {
    if (trackerRef.current) {
      trackerRef.current.simulateStep();
    }
  };

  const handleSimulateTurn = (deg) => {
    if (trackerRef.current) {
      trackerRef.current.simulateTurn(deg);
    }
  };

  if (!active) return null;

  const totalDistanceMeters = Math.round(((stepCount * stepLengthMeters)) * 10) / 10;

  return (
    <div
      id="walk-capture-panel"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[95vw] max-w-lg bg-[#0e131f]/95 border border-blue-500/30 backdrop-blur-2xl rounded-3xl p-4 shadow-[0_10px_35px_rgba(0,0,0,0.7)] text-white select-none animate-fadeIn"
    >
      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 text-xs">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-xl ${phase === 'walking' ? 'bg-amber-500/20 text-amber-400 animate-pulse' : 'bg-blue-500/20 text-blue-400'}`}>
            <Footprints size={16} />
          </div>
          <div>
            <div className="font-semibold text-white flex items-center gap-1.5">
              <span>Walk-to-Draw Path Capture</span>
              {phase === 'walking' && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                  RECORDING
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-400">
              {phase === 'setup' && '1. Set start position & facing direction'}
              {phase === 'walking' && `${stepCount} steps • ${totalDistanceMeters}m walked`}
              {phase === 'review' && 'Review captured draft path'}
            </div>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Cancel walk-to-draw"
        >
          <X size={16} />
        </button>
      </div>

      {/* PHASE 1: SETUP & ANCHOR */}
      {phase === 'setup' && (
        <div className="space-y-3 text-xs">
          {/* Start Anchor Status */}
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <MapPin size={18} className={startAnchor ? 'text-emerald-400' : 'text-gray-500'} />
              <div>
                <div className="font-medium text-white">
                  {startAnchor ? `Start Anchor: (${Math.round(startAnchor.x)}, ${Math.round(startAnchor.y)})` : 'Tap canvas to set start anchor'}
                </div>
                <div className="text-[11px] text-gray-400">
                  {startAnchor?.label || (startAnchor ? 'Known starting point' : 'Tap any corridor node, door, or position')}
                </div>
              </div>
            </div>
            {startAnchor && (
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                ✓ Set
              </span>
            )}
          </div>

          {/* Facing Direction Alignment */}
          {startAnchor && (
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-300">
                  <Compass size={16} className="text-blue-400" />
                  <span>Facing Direction: <strong className="text-white">{Math.round(facingAngle)}°</strong></span>
                </div>
                <button
                  onClick={() => {
                    // Set current compass heading as facing direction
                    if (onSetFacingAngle) {
                      onSetFacingAngle(compassHeading || 0);
                    }
                  }}
                  className="px-2.5 py-1 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Set Facing Direction
                </button>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Face physically down the corridor you are about to walk, then tap "Set Facing Direction" to align your phone's compass with the corridor.
              </p>
            </div>
          )}

          {/* Start Button */}
          <button
            disabled={!startAnchor}
            onClick={handleStartWalking}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
              startAnchor
                ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-blue-500/25'
                : 'bg-white/10 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Footprints size={18} />
            <span>Start Walking</span>
          </button>
        </div>
      )}

      {/* PHASE 2: ACTIVE WALKING CAPTURE */}
      {phase === 'walking' && (
        <div className="space-y-3">
          {/* Real-time Telemetry Strip */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[10px] text-gray-400 uppercase font-medium">Steps</div>
              <div className="text-base font-bold text-white mt-0.5">{stepCount}</div>
            </div>
            <div className="p-2 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[10px] text-gray-400 uppercase font-medium">Distance</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">{totalDistanceMeters}m</div>
            </div>
            <div className="p-2 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[10px] text-gray-400 uppercase font-medium">Heading</div>
              <div className="text-base font-bold text-blue-400 mt-0.5">{Math.round(currentHeading)}°</div>
            </div>
          </div>

          {/* Quick Inline Node Type Selector */}
          <div>
            <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1.5 flex items-center justify-between">
              <span>Next Waypoint Node Type</span>
              <span>{waypoints.length} Dropped</span>
            </div>
            <div className="grid grid-cols-4 gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
              {NODE_TYPES.map((nt) => (
                <button
                  key={nt.id}
                  onClick={() => setSelectedNodeType(nt.id)}
                  style={{
                    backgroundColor: selectedNodeType === nt.id ? `${nt.color}35` : 'transparent',
                    borderColor: selectedNodeType === nt.id ? nt.color : 'transparent',
                    color: selectedNodeType === nt.id ? nt.color : '#9ca3af',
                  }}
                  className="py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer text-center truncate"
                >
                  {nt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Large Thumb-Reachable Drop Waypoint Button */}
          <button
            onClick={handleDropWaypoint}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-base transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer"
          >
            <MapPin size={20} />
            <span>Drop Waypoint ({NODE_TYPES.find((t) => t.id === selectedNodeType)?.label})</span>
          </button>

          {/* Desktop Testing Simulator Controls & Finish Button */}
          <div className="flex items-center gap-2 pt-1">
            {/* Step Simulator Buttons for testing */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => handleSimulateTurn(-15)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 cursor-pointer"
                title="Turn Left 15°"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={handleSimulateStep}
                className="px-2.5 py-1.5 rounded-lg bg-blue-600/40 hover:bg-blue-600/60 text-blue-200 text-xs font-bold cursor-pointer"
                title="Simulate 1 Step Forward"
              >
                +1 Step
              </button>
              <button
                onClick={() => handleSimulateTurn(15)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 cursor-pointer"
                title="Turn Right 15°"
              >
                <RotateCw size={14} />
              </button>
            </div>

            {/* Finish Here Button */}
            <button
              onClick={handleFinishWalking}
              className="flex-1 py-2.5 px-4 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-semibold text-xs transition-colors shadow-md flex items-center justify-center gap-1.5 cursor-pointer ml-auto"
            >
              <Square size={14} />
              <span>Finish Here</span>
            </button>
          </div>
        </div>
      )}

      {/* PHASE 3: REVIEW & COMMIT */}
      {phase === 'review' && (
        <div className="space-y-3 text-xs">
          {/* Snap Candidate & Drift Correction Card */}
          {snapCandidate ? (
            <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-blue-300">
                  <Sparkles size={16} />
                  <span>Snap to Existing Node Detected</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                  {snapCandidate.distanceMeters}m away
                </span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Endpoint is close to <strong className="text-white">{snapCandidate.node.type || 'corridor'} node</strong>.
                Applying linear drift correction stretches and rotates the recorded path smoothly between verified start and end anchors.
              </p>

              {/* Drift Correction Toggle */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDriftCorrection}
                    onChange={(e) => setUseDriftCorrection(e.target.checked)}
                    className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Apply Linear Drift Correction</span>
                </label>
                {driftStats && (
                  <span className="text-[10px] text-blue-300 font-mono">
                    Scale: {driftStats.scaleFactor}x • Rot: {driftStats.rotationDegrees}°
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Unverified Endpoint</div>
                <div className="text-[11px] text-amber-300/80 mt-0.5">
                  The endpoint did not snap to any known node. The raw trail will be recorded as-is and may be adjusted manually in Select mode.
                </div>
              </div>
            </div>
          )}

          {/* Draft Summary Card */}
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div>
              <div className="font-semibold text-white">
                {waypoints.length} Nodes • {Math.max(0, waypoints.length - 1)} Edges
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                Total Path Length: ~{totalDistanceMeters} meters
              </div>
            </div>
            <div className="text-[10px] text-gray-400 text-right font-mono">
              {useDriftCorrection ? 'Corrected (Pinned)' : 'Raw Dead-Reckoned'}
            </div>
          </div>

          {/* Action Buttons: Commit or Discard */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleCommit}
              className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check size={16} />
              <span>Commit to Map</span>
            </button>
            <button
              onClick={onCancel}
              className="py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
