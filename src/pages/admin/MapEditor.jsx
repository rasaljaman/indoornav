import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ChevronDown, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import MapToolbar from '../../components/map/MapToolbar';
import CanvasManager from '../../components/map/CanvasManager';
import ElementPropertiesPanel from '../../components/map/ElementPropertiesPanel';
import { ScaleCalibrationModal, BlueprintUploadModal } from '../../components/map/MapModals';
import { useMapHistory } from '../../hooks/useMapHistory';

const INITIAL_STATE = {
  rooms: [],
  nodes: [],
  edges: [],
  qrPoints: [],
  deletedRoomIds: [],
  deletedNodeIds: [],
  deletedEdgeIds: [],
};

export default function MapEditor() {
  const { buildingId, floorId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Tools & View state
  const [currentTool, setCurrentTool] = useState('select');
  const [nodeType, setNodeType] = useState('junction');
  const [floorData, setFloorData] = useState(null);
  const [blueprintUrl, setBlueprintUrl] = useState(null);
  const [orgSlug, setOrgSlug] = useState(null);

  // Grid & Snap state
  const [gridVisible, setGridVisible] = useState(true);
  const [gridSize, setGridSize] = useState(20);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Floor picker state
  const [allFloors, setAllFloors] = useState([]);
  const [showFloorPicker, setShowFloorPicker] = useState(false);

  // Modals state
  const [calibrationPts, setCalibrationPts] = useState(null); // [x1, y1, x2, y2]
  const [showBlueprintModal, setShowBlueprintModal] = useState(false);

  // Undo / Redo History
  const {
    state,
    setState: pushState,
    resetHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    historyLength,
  } = useMapHistory(INITIAL_STATE);

  const {
    rooms,
    nodes,
    edges,
    qrPoints,
    deletedRoomIds,
    deletedNodeIds,
    deletedEdgeIds,
  } = state;

  // Track unsaved changes
  const [savedHistoryMarker, setSavedHistoryMarker] = useState(0);
  const hasUnsavedChanges = historyLength !== savedHistoryMarker;

  // Unified Selection State: { type: 'room' | 'node' | 'edge' | null, id: string | null, ids: Set }
  const [selection, setSelection] = useState({ type: null, id: null, ids: new Set() });

  // Load Floor & Map Data from Supabase
  useEffect(() => {
    async function loadFloorData() {
      if (!floorId) return;
      try {
        setLoading(true);

        // 1. Load Floor info
        const { data: floor, error: floorErr } = await supabase
          .from('floors')
          .select('*')
          .eq('id', floorId)
          .single();
        if (floorErr) throw floorErr;
        setFloorData(floor);

        // 2. Load all floors for this building (for floor switcher dropdown)
        const { data: floorsData } = await supabase
          .from('floors')
          .select('id, name, level')
          .eq('building_id', floor.building_id || buildingId)
          .order('level');
        setAllFloors(floorsData || []);

        // 3. Load Rooms
        const { data: roomsData } = await supabase
          .from('rooms')
          .select('*')
          .eq('floor_id', floorId);

        // 4. Load Nodes
        const { data: nodesData } = await supabase
          .from('nodes')
          .select('*')
          .eq('floor_id', floorId);

        // 5. Load Edges & QR Points
        let edgesData = [];
        let qrData = [];
        if (nodesData && nodesData.length > 0) {
          const nodeIds = nodesData.map((n) => n.id);

          const { data: ed } = await supabase
            .from('edges')
            .select('*')
            .in('from_node', nodeIds);
          if (ed) edgesData = ed;

          const { data: qd } = await supabase
            .from('qr_points')
            .select('*')
            .in('node_id', nodeIds);
          if (qd) qrData = qd;
        }

        // 6. Load Org Slug
        const { data: bldg } = await supabase
          .from('buildings')
          .select('org_id')
          .eq('id', floor.building_id || buildingId)
          .single();
        if (bldg) {
          const { data: org } = await supabase
            .from('organizations')
            .select('slug')
            .eq('id', bldg.org_id)
            .single();
          if (org) setOrgSlug(org.slug);
        }

        // Initialize history stack with loaded state
        resetHistory({
          rooms: roomsData || [],
          nodes: nodesData || [],
          edges: edgesData || [],
          qrPoints: qrData || [],
          deletedRoomIds: [],
          deletedNodeIds: [],
          deletedEdgeIds: [],
        });
        setSavedHistoryMarker(0);
      } catch (err) {
        console.error('Failed to load floor data:', err);
      } finally {
        setLoading(false);
      }
    }

    setSelection({ type: null, id: null, ids: new Set() });
    loadFloorData();
  }, [floorId, buildingId, resetHistory]);

  // Pixels per meter calculation
  const pixelsPerMeter = useMemo(() => {
    if (!floorData || !floorData.real_width_m || floorData.real_width_m <= 0) {
      return 1;
    }
    const mapW = floorData.map_width || 1920;
    return mapW / floorData.real_width_m;
  }, [floorData]);

  // Selection Handler
  const handleSelect = useCallback(({ type, id, isMulti = false }) => {
    if (!id || !type) {
      setSelection({ type: null, id: null, ids: new Set() });
      return;
    }

    setSelection((prev) => {
      if (isMulti) {
        const newIds = new Set(prev.ids);
        if (newIds.has(id)) {
          newIds.delete(id);
          const remainingIds = Array.from(newIds);
          return {
            type: remainingIds.length > 0 ? prev.type : null,
            id: remainingIds.length > 0 ? remainingIds[remainingIds.length - 1] : null,
            ids: newIds,
          };
        } else {
          newIds.add(id);
          return { type, id, ids: newIds };
        }
      }
      return { type, id, ids: new Set([id]) };
    });
  }, []);

  // Update Rooms (from drag or canvas draw)
  const handleRoomsChange = useCallback((updatedRooms) => {
    pushState((prev) => ({ ...prev, rooms: updatedRooms }), 'Update rooms');
  }, [pushState]);

  // Update Nodes (from drag or placement)
  const handleNodesChange = useCallback((updatedNodes) => {
    pushState((prev) => ({ ...prev, nodes: updatedNodes }), 'Update nodes');
  }, [pushState]);

  // Update Edges
  const handleEdgesChange = useCallback((updatedEdges) => {
    pushState((prev) => ({ ...prev, edges: updatedEdges }), 'Update edges');
  }, [pushState]);

  // Commit history snapshot explicitly
  const handleCommitHistory = useCallback((partialState) => {
    pushState((prev) => ({ ...prev, ...partialState }), 'Commit history snapshot');
  }, [pushState]);

  // Delete Handlers
  const handleDeleteRoom = useCallback((roomId) => {
    pushState((prev) => ({
      ...prev,
      rooms: prev.rooms.filter((r) => r.id !== roomId),
      deletedRoomIds: [...prev.deletedRoomIds, roomId],
    }), 'Delete room');
    setSelection({ type: null, id: null, ids: new Set() });
  }, [pushState]);

  const handleDeleteNode = useCallback((nodeId) => {
    pushState((prev) => {
      // Find connected edges
      const connectedEdges = prev.edges.filter(
        (e) => e.from_node === nodeId || e.to_node === nodeId
      );
      const connectedEdgeIds = connectedEdges.map((e) => e.id);

      return {
        ...prev,
        nodes: prev.nodes.filter((n) => n.id !== nodeId),
        edges: prev.edges.filter((e) => e.from_node !== nodeId && e.to_node !== nodeId),
        qrPoints: prev.qrPoints.filter((q) => q.node_id !== nodeId),
        deletedNodeIds: [...prev.deletedNodeIds, nodeId],
        deletedEdgeIds: [...prev.deletedEdgeIds, ...connectedEdgeIds],
      };
    }, 'Delete node');
    setSelection({ type: null, id: null, ids: new Set() });
  }, [pushState]);

  const handleDeleteEdge = useCallback((edgeId) => {
    pushState((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== edgeId),
      deletedEdgeIds: [...prev.deletedEdgeIds, edgeId],
    }), 'Delete edge');
    setSelection({ type: null, id: null, ids: new Set() });
  }, [pushState]);

  // Delete Currently Selected Item(s)
  const handleDeleteSelected = useCallback(() => {
    if (!selection.id) return;
    if (selection.type === 'room') {
      selection.ids.forEach((id) => handleDeleteRoom(id));
    } else if (selection.type === 'node') {
      selection.ids.forEach((id) => handleDeleteNode(id));
    } else if (selection.type === 'edge') {
      selection.ids.forEach((id) => handleDeleteEdge(id));
    }
  }, [selection, handleDeleteRoom, handleDeleteNode, handleDeleteEdge]);

  // Global Keyboard Shortcuts (Undo, Redo, Delete, Tools)
  useEffect(() => {
    function handleKeyDown(e) {
      // Ignore when focused in text inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Ctrl+Z / Cmd+Z
      if (isCmdOrCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
        return;
      }

      // Redo: Ctrl+Y / Cmd+Shift+Z / Ctrl+Shift+Z
      if (
        (isCmdOrCtrl && e.key.toLowerCase() === 'y') ||
        (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        if (canRedo) redo();
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Quick Tool Keys
      if (!isCmdOrCtrl && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            setCurrentTool('select');
            break;
          case 'r':
            setCurrentTool('room');
            break;
          case 'n':
            setCurrentTool('node');
            break;
          case 'p':
            setCurrentTool('edge');
            break;
          case 's':
            setCurrentTool('scale');
            break;
          case 'q':
            setCurrentTool('qr');
            break;
          default:
            break;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo, handleDeleteSelected]);

  // Scale Calibration Line Drawn
  const handleScaleCalibrated = (pts) => {
    setCalibrationPts(pts);
  };

  // Scale Calibration Confirmed
  const handleConfirmScale = async (meters) => {
    if (!calibrationPts || calibrationPts.length < 4) return;
    const dx = calibrationPts[2] - calibrationPts[0];
    const dy = calibrationPts[3] - calibrationPts[1];
    const pixelDistance = Math.hypot(dx, dy);

    const ppm = pixelDistance / meters;
    const mapW = floorData?.map_width || 1920;
    const mapH = floorData?.map_height || 1080;
    const realWidth = mapW / ppm;
    const realHeight = mapH / ppm;

    try {
      await supabase
        .from('floors')
        .update({ real_width_m: realWidth, real_height_m: realHeight })
        .eq('id', floorId);

      setFloorData((prev) => ({ ...prev, real_width_m: realWidth, real_height_m: realHeight }));
    } catch (err) {
      console.error('Error saving scale calibration:', err);
    } finally {
      setCalibrationPts(null);
      setCurrentTool('select');
    }
  };

  // Blueprint Plan Upload Confirmed
  const handleConfirmBlueprint = (url) => {
    setBlueprintUrl(url);
    setShowBlueprintModal(false);
  };

  // QR Code Assignment / Removal
  const handleToggleQr = async (nodeId) => {
    if (!orgSlug) {
      alert('Organization slug is still loading. Please wait a moment.');
      return;
    }

    const existing = qrPoints.find((q) => q.node_id === nodeId);
    if (existing) {
      try {
        await supabase.from('qr_points').delete().eq('id', existing.id);
        pushState((prev) => ({
          ...prev,
          qrPoints: prev.qrPoints.filter((q) => q.id !== existing.id),
        }), 'Remove QR Code');
      } catch (err) {
        console.error('Failed to remove QR point:', err);
      }
      return;
    }

    const baseUrl = window.location.origin;
    const qrValue = `${baseUrl}/${orgSlug}?loc=${nodeId}`;

    try {
      const { data: newQr, error } = await supabase
        .from('qr_points')
        .insert([{ node_id: nodeId, qr_code_value: qrValue }])
        .select()
        .single();

      if (error) throw error;
      pushState((prev) => ({
        ...prev,
        qrPoints: [...prev.qrPoints, newQr],
      }), 'Assign QR Code');
    } catch (err) {
      console.error('Failed to assign QR:', err);
      alert('Failed to assign QR: ' + err.message);
    }
  };

  // Save Map to Supabase
  const handleSave = async () => {
    setSaving(true);
    setSaveSuccessNotice(false);

    try {
      // 1. Delete removed items in foreign-key safe order
      if (deletedEdgeIds.length > 0) {
        await supabase.from('edges').delete().in('id', deletedEdgeIds);
      }
      if (deletedRoomIds.length > 0) {
        await supabase.from('rooms').delete().in('id', deletedRoomIds);
      }
      if (deletedNodeIds.length > 0) {
        await supabase.from('qr_points').delete().in('node_id', deletedNodeIds);
        await supabase.from('edges').delete().in('from_node', deletedNodeIds);
        await supabase.from('edges').delete().in('to_node', deletedNodeIds);
        await supabase.from('nodes').delete().in('id', deletedNodeIds);
      }

      // 2. Upsert Rooms
      if (rooms.length > 0) {
        const roomsToSave = rooms.map((r) => ({ ...r, floor_id: floorId }));
        const { error: rErr } = await supabase.from('rooms').upsert(roomsToSave);
        if (rErr) throw rErr;
      }

      // 3. Upsert Nodes
      if (nodes.length > 0) {
        const nodesToSave = nodes.map((n) => ({ ...n, floor_id: floorId }));
        const { error: nErr } = await supabase.from('nodes').upsert(nodesToSave);
        if (nErr) throw nErr;
      }

      // 4. Compute accurate edge weights and upsert Edges
      if (edges.length > 0) {
        const edgesToSave = edges.map((edge) => {
          const n1 = nodes.find((n) => n.id === edge.from_node);
          const n2 = nodes.find((n) => n.id === edge.to_node);
          let weight = 1;
          if (n1 && n2) {
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const pixelDist = Math.hypot(dx, dy);
            weight = pixelsPerMeter > 0 ? pixelDist / pixelsPerMeter : pixelDist;
          }
          return { ...edge, weight };
        });
        const { error: eErr } = await supabase.from('edges').upsert(edgesToSave);
        if (eErr) throw eErr;
      }

      // 5. Clear deletion queues in state and record saved history marker
      pushState((prev) => ({
        ...prev,
        deletedRoomIds: [],
        deletedNodeIds: [],
        deletedEdgeIds: [],
      }), 'Save map');
      setSavedHistoryMarker(historyLength + 1);

      // Show success feedback
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 3500);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save map: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white">
        <Loader2 className="animate-spin mr-2 text-blue-500" />
        <span className="text-gray-300">Loading Map Editor...</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0a0a0f] text-white">
      {/* Top Navbar overlay */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/85 via-black/50 to-transparent flex items-center px-6 z-20 pointer-events-none">
        <button
          onClick={() => navigate('/admin')}
          className="pointer-events-auto flex items-center gap-2 text-gray-300 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 text-sm font-medium"
        >
          <ArrowLeft size={18} />
          Dashboard
        </button>

        <div className="ml-auto pointer-events-auto flex items-center gap-3">
          {/* Floor Selector */}
          {allFloors.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowFloorPicker(!showFloorPicker)}
                className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 px-3.5 py-1.5 rounded-xl border border-white/10 transition-colors"
              >
                {floorData?.name || 'Floor'}
                <ChevronDown size={14} />
              </button>
              {showFloorPicker && (
                <div className="absolute top-full right-0 mt-2 bg-[#0e0e16]/95 border border-white/15 rounded-xl p-1.5 min-w-[180px] z-50 backdrop-blur-2xl shadow-2xl">
                  {allFloors.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setShowFloorPicker(false);
                        navigate(`/admin/buildings/${buildingId}/floors/${f.id}/editor`);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        f.id === floorId
                          ? 'bg-blue-600/30 text-blue-400 font-semibold'
                          : 'text-gray-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      L{f.level} — {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <span className="font-semibold text-sm text-gray-200">{floorData?.name || 'Map Editor'}</span>

          {floorData?.real_width_m ? (
            <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2.5 py-1 rounded-full font-medium">
              Scale: {floorData.real_width_m.toFixed(1)}m
            </span>
          ) : (
            <button
              onClick={() => setCurrentTool('scale')}
              className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full hover:bg-amber-500/30 cursor-pointer font-medium"
            >
              ⚠️ Set Scale
            </button>
          )}

          <button
            onClick={() => navigate(`/admin/buildings/${buildingId}/floors/${floorId}/print-qrs`)}
            className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl font-medium transition-colors"
          >
            Print QRs
          </button>

          {/* Saving Status Badge */}
          {saving && (
            <span className="text-xs text-blue-400 flex items-center bg-blue-500/10 px-3 py-1.5 rounded-xl border border-blue-500/20">
              <Loader2 className="animate-spin w-3.5 h-3.5 mr-1.5" /> Saving...
            </span>
          )}

          {saveSuccessNotice && (
            <span className="text-xs text-green-400 flex items-center bg-green-500/10 px-3 py-1.5 rounded-xl border border-green-500/20 animate-fadeIn">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Saved!
            </span>
          )}
        </div>
      </div>

      {/* Left Toolbar */}
      <MapToolbar
        currentTool={currentTool}
        setTool={setCurrentTool}
        nodeType={nodeType}
        setNodeType={setNodeType}
        onSave={handleSave}
        onUploadPlan={() => setShowBlueprintModal(true)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        gridVisible={gridVisible}
        onToggleGrid={() => setGridVisible(!gridVisible)}
        gridSize={gridSize}
        onChangeGridSize={setGridSize}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled(!snapEnabled)}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Interactive Konva Canvas */}
      <CanvasManager
        currentTool={currentTool}
        nodeType={nodeType}
        blueprintUrl={blueprintUrl}
        rooms={rooms}
        nodes={nodes}
        edges={edges}
        qrPoints={qrPoints}
        selection={selection}
        onSelect={handleSelect}
        onRoomsChange={handleRoomsChange}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onScaleCalibrated={handleScaleCalibrated}
        onNodeQrClick={handleToggleQr}
        onDeleteSelected={handleDeleteSelected}
        onCommitHistory={handleCommitHistory}
        gridVisible={gridVisible}
        gridSize={gridSize}
        snapEnabled={snapEnabled}
      />

      {/* Unified Element Properties Inspector Panel */}
      <ElementPropertiesPanel
        selection={selection}
        rooms={rooms}
        nodes={nodes}
        edges={edges}
        qrPoints={qrPoints}
        pixelsPerMeter={pixelsPerMeter}
        onUpdateRoom={(updatedRoom) => {
          pushState((prev) => ({
            ...prev,
            rooms: prev.rooms.map((r) => (r.id === updatedRoom.id ? updatedRoom : r)),
          }), 'Update room properties');
        }}
        onDeleteRoom={handleDeleteRoom}
        onUpdateNode={(updatedNode) => {
          pushState((prev) => ({
            ...prev,
            nodes: prev.nodes.map((n) => (n.id === updatedNode.id ? updatedNode : n)),
          }), 'Update node properties');
        }}
        onDeleteNode={handleDeleteNode}
        onDeleteEdge={handleDeleteEdge}
        onToggleQr={handleToggleQr}
        onClose={() => setSelection({ type: null, id: null, ids: new Set() })}
      />

      {/* Scale Calibration Dialog */}
      {calibrationPts && (
        <ScaleCalibrationModal
          pixelDistance={Math.hypot(
            calibrationPts[2] - calibrationPts[0],
            calibrationPts[3] - calibrationPts[1]
          )}
          onConfirm={handleConfirmScale}
          onCancel={() => {
            setCalibrationPts(null);
            setCurrentTool('select');
          }}
        />
      )}

      {/* Blueprint Image Dialog */}
      {showBlueprintModal && (
        <BlueprintUploadModal
          currentUrl={blueprintUrl}
          onConfirm={handleConfirmBlueprint}
          onCancel={() => setShowBlueprintModal(false)}
        />
      )}
    </div>
  );
}
