import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import MapToolbar from '../../components/map/MapToolbar';
import CanvasManager from '../../components/map/CanvasManager';
import RoomPropertiesPanel from '../../components/map/RoomPropertiesPanel';

export default function MapEditor() {
  const { buildingId, floorId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [currentTool, setCurrentTool] = useState('select');
  const [nodeType, setNodeType] = useState('junction');
  const [floorData, setFloorData] = useState(null);
  const [blueprintUrl, setBlueprintUrl] = useState(null);
  const [orgSlug, setOrgSlug] = useState(null);

  // Floor tabs
  const [allFloors, setAllFloors] = useState([]);
  const [showFloorPicker, setShowFloorPicker] = useState(false);

  // Map Data State
  const [rooms, setRooms] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [qrPoints, setQrPoints] = useState([]);

  // Selection
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  // Deletion tracking
  const [deletedRoomIds, setDeletedRoomIds] = useState([]);
  const [deletedNodeIds, setDeletedNodeIds] = useState([]);
  const [deletedEdgeIds, setDeletedEdgeIds] = useState([]);

  useEffect(() => {
    async function loadFloorData() {
      if (!floorId) return;
      try {
        setLoading(true);
        // Load Floor info
        const { data: floor, error: floorErr } = await supabase
          .from('floors')
          .select('*')
          .eq('id', floorId)
          .single();
        if (floorErr) throw floorErr;
        setFloorData(floor);

        // Load all floors for this building (for floor tabs)
        const { data: floorsData } = await supabase
          .from('floors')
          .select('id, name, level')
          .eq('building_id', floor.building_id || buildingId)
          .order('level');
        setAllFloors(floorsData || []);

        // Load Rooms
        const { data: roomsData } = await supabase
          .from('rooms')
          .select('*')
          .eq('floor_id', floorId);
        if (roomsData) setRooms(roomsData);

        // Load Nodes
        const { data: nodesData } = await supabase
          .from('nodes')
          .select('*')
          .eq('floor_id', floorId);
        if (nodesData) setNodes(nodesData);

        // Load Edges & QR Points
        if (nodesData && nodesData.length > 0) {
          const nodeIds = nodesData.map(n => n.id);
          const { data: edgesData } = await supabase
            .from('edges')
            .select('*')
            .in('from_node', nodeIds);
          if (edgesData) setEdges(edgesData);

          const { data: qrData } = await supabase
            .from('qr_points')
            .select('*')
            .in('node_id', nodeIds);
          if (qrData) setQrPoints(qrData);
        }

        // Load Org Slug
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
      } catch (err) {
        console.error('Failed to load floor data:', err);
      } finally {
        setLoading(false);
      }
    }

    // Reset state when switching floors
    setRooms([]);
    setNodes([]);
    setEdges([]);
    setQrPoints([]);
    setDeletedRoomIds([]);
    setDeletedNodeIds([]);
    setDeletedEdgeIds([]);
    setSelectedRoomId(null);

    loadFloorData();
  }, [floorId, buildingId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Delete removed items first
      if (deletedEdgeIds.length > 0) {
        await supabase.from('edges').delete().in('id', deletedEdgeIds);
      }
      if (deletedRoomIds.length > 0) {
        await supabase.from('rooms').delete().in('id', deletedRoomIds);
      }
      // Delete QR points for deleted nodes first
      if (deletedNodeIds.length > 0) {
        await supabase.from('qr_points').delete().in('node_id', deletedNodeIds);
        await supabase.from('edges').delete().in('from_node', deletedNodeIds);
        await supabase.from('edges').delete().in('to_node', deletedNodeIds);
        await supabase.from('nodes').delete().in('id', deletedNodeIds);
      }

      // 2. Upsert remaining items
      if (rooms.length > 0) {
        const roomsToSave = rooms.map(r => ({ ...r, floor_id: floorId }));
        await supabase.from('rooms').upsert(roomsToSave);
      }
      if (nodes.length > 0) {
        const nodesToSave = nodes.map(n => ({ ...n, floor_id: floorId }));
        await supabase.from('nodes').upsert(nodesToSave);
      }
      if (edges.length > 0) {
        let pixelsPerMeter = 1;
        if (floorData && floorData.real_width_m) {
          pixelsPerMeter = (floorData.map_width || 1920) / floorData.real_width_m;
        }

        const edgesToSave = edges.map(edge => {
          const n1 = nodes.find(n => n.id === edge.from_node);
          const n2 = nodes.find(n => n.id === edge.to_node);
          if (n1 && n2) {
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const pixelDist = Math.sqrt(dx * dx + dy * dy);
            edge.weight = pixelDist / pixelsPerMeter;
          }
          return edge;
        });
        await supabase.from('edges').upsert(edgesToSave);
      }

      // 3. Clear deletion tracking
      setDeletedRoomIds([]);
      setDeletedNodeIds([]);
      setDeletedEdgeIds([]);

      alert('Map saved successfully!');
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save map.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPlan = () => {
    const url = prompt('Enter the URL of the floor plan image (e.g. from Imgur or a public link):');
    if (url) {
      setBlueprintUrl(url);
    }
  };

  const handleScaleCalibrated = async (pts) => {
    const dx = pts[2] - pts[0];
    const dy = pts[3] - pts[1];
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    const meterInput = prompt(`You drew a line of ${pixelDistance.toFixed(2)} pixels.\nHow many real-world METERS is this?`);
    if (meterInput && !isNaN(meterInput)) {
      const meters = parseFloat(meterInput);
      const pixelsPerMeter = pixelDistance / meters;
      const mapW = floorData?.map_width || 1920;
      const mapH = floorData?.map_height || 1080;
      const realWidth = mapW / pixelsPerMeter;
      const realHeight = mapH / pixelsPerMeter;

      try {
        await supabase
          .from('floors')
          .update({ real_width_m: realWidth, real_height_m: realHeight })
          .eq('id', floorId);

        setFloorData(prev => ({ ...prev, real_width_m: realWidth, real_height_m: realHeight }));
        alert(`Scale calibrated! Map is now ${realWidth.toFixed(2)}m × ${realHeight.toFixed(2)}m.`);
      } catch (err) {
        console.error('Error saving scale:', err);
      }
    }
    setCurrentTool('select');
  };

  const handleNodeQrClick = async (nodeId) => {
    if (!orgSlug) {
      alert("Organization slug not loaded yet. Please wait.");
      return;
    }

    const existing = qrPoints.find(q => q.node_id === nodeId);
    if (existing) {
      if (confirm("This node already has a QR code assigned. Delete it?")) {
        await supabase.from('qr_points').delete().eq('id', existing.id);
        setQrPoints(qrPoints.filter(q => q.id !== existing.id));
      }
      return;
    }

    const baseUrl = window.location.origin;
    const qrValue = `${baseUrl}/${orgSlug}?loc=${nodeId}`;

    const { data: newQr, error } = await supabase
      .from('qr_points')
      .insert([{ node_id: nodeId, qr_code_value: qrValue }])
      .select()
      .single();

    if (error) {
      alert("Failed to assign QR: " + error.message);
    } else {
      setQrPoints([...qrPoints, newQr]);
    }
  };

  // Delete handlers
  const handleDeleteRoom = (roomId) => {
    setDeletedRoomIds(prev => [...prev, roomId]);
    setRooms(prev => prev.filter(r => r.id !== roomId));
    setSelectedRoomId(null);
  };

  const handleDeleteNode = (nodeId) => {
    // Also remove edges connected to this node
    const connectedEdges = edges.filter(e => e.from_node === nodeId || e.to_node === nodeId);
    setDeletedEdgeIds(prev => [...prev, ...connectedEdges.map(e => e.id)]);
    setEdges(prev => prev.filter(e => e.from_node !== nodeId && e.to_node !== nodeId));

    // Remove QR points for this node
    setQrPoints(prev => prev.filter(q => q.node_id !== nodeId));

    setDeletedNodeIds(prev => [...prev, nodeId]);
    setNodes(prev => prev.filter(n => n.id !== nodeId));
  };

  const handleDeleteEdge = (edgeId) => {
    setDeletedEdgeIds(prev => [...prev, edgeId]);
    setEdges(prev => prev.filter(e => e.id !== edgeId));
  };

  // Room update handler
  const handleRoomUpdate = (updatedRoom) => {
    setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));
  };

  const selectedRoom = rooms.find(r => r.id === selectedRoomId);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white">
        <Loader2 className="animate-spin mr-2" /> Loading Map Editor...
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white">
      {/* Top Navbar overlay */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/80 to-transparent flex items-center px-6 z-20 pointer-events-none">
        <button
          onClick={() => navigate('/admin')}
          className="pointer-events-auto flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          Dashboard
        </button>
        <div className="ml-auto pointer-events-auto flex items-center gap-3">
          {/* Floor Selector */}
          {allFloors.length > 1 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowFloorPicker(!showFloorPicker)}
                className="flex items-center gap-1 text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                {floorData?.name || 'Floor'}
                <ChevronDown size={14} />
              </button>
              {showFloorPicker && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  background: 'rgba(10,10,15,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  padding: '4px',
                  minWidth: '180px',
                  zIndex: 50,
                  backdropFilter: 'blur(20px)',
                }}>
                  {allFloors.map(f => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setShowFloorPicker(false);
                        navigate(`/admin/buildings/${buildingId}/floors/${f.id}/editor`);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: f.id === floorId ? 'rgba(59,130,246,0.2)' : 'transparent',
                        color: f.id === floorId ? '#60a5fa' : '#d1d5db',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontFamily: 'inherit',
                      }}
                    >
                      L{f.level} — {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <span className="font-semibold text-sm">{floorData?.name || 'Map Editor'}</span>
          {floorData?.real_width_m && (
            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">Scale Set</span>
          )}
          <button
            onClick={() => navigate(`/admin/buildings/${buildingId}/floors/${floorId}/print-qrs`)}
            className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
          >
            Print QRs
          </button>
          {saving && <span className="text-sm text-blue-400 flex items-center"><Loader2 className="animate-spin w-4 h-4 mr-2"/> Saving...</span>}
        </div>
      </div>

      {/* Toolbar */}
      <MapToolbar
        currentTool={currentTool}
        setTool={setCurrentTool}
        nodeType={nodeType}
        setNodeType={setNodeType}
        onSave={handleSave}
        onUploadPlan={handleUploadPlan}
      />

      {/* Canvas Area */}
      <CanvasManager
        currentTool={currentTool}
        nodeType={nodeType}
        blueprintUrl={blueprintUrl}
        rooms={rooms}
        nodes={nodes}
        edges={edges}
        qrPoints={qrPoints}
        selectedRoomId={selectedRoomId}
        onRoomsChange={setRooms}
        onNodesChange={setNodes}
        onEdgesChange={setEdges}
        onScaleCalibrated={handleScaleCalibrated}
        onNodeQrClick={handleNodeQrClick}
        onRoomSelect={setSelectedRoomId}
        onDeleteRoom={handleDeleteRoom}
        onDeleteNode={handleDeleteNode}
        onDeleteEdge={handleDeleteEdge}
      />

      {/* Room Properties Panel */}
      <RoomPropertiesPanel
        room={selectedRoom}
        onUpdate={handleRoomUpdate}
        onDelete={handleDeleteRoom}
        onClose={() => setSelectedRoomId(null)}
      />
    </div>
  );
}
