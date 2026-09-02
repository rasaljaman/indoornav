import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import MapToolbar from '../../components/map/MapToolbar';
import CanvasManager from '../../components/map/CanvasManager';

export default function MapEditor() {
  const { buildingId, floorId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [currentTool, setCurrentTool] = useState('select');
  const [floorData, setFloorData] = useState(null);
  const [blueprintUrl, setBlueprintUrl] = useState(null);
  const [orgSlug, setOrgSlug] = useState(null);

  // Map Data State
  const [rooms, setRooms] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [qrPoints, setQrPoints] = useState([]);

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

        // Load Edges
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
          .eq('id', floorData ? floorData.building_id : buildingId)
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
    loadFloorData();
  }, [floorId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Very basic save implementation: upsert rooms and nodes
      // Note: Real implementation would need to diff deletions as well
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
          pixelsPerMeter = 1920 / floorData.real_width_m;
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
      alert('Map saved successfully!');
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save map.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPlan = () => {
    // Phase 1 shortcut: ask for URL instead of full file upload to keep it simple for now
    const url = prompt('Enter the URL of the floor plan image (e.g. from Imgur or a public link):');
    if (url) {
      setBlueprintUrl(url);
    }
  };

  const handleScaleCalibrated = async (pts) => {
    // pts = [x1, y1, x2, y2]
    const dx = pts[2] - pts[0];
    const dy = pts[3] - pts[1];
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    const meterInput = prompt(`You drew a line of ${pixelDistance.toFixed(2)} pixels.\nHow many real-world METERS is this?`);
    if (meterInput && !isNaN(meterInput)) {
      const meters = parseFloat(meterInput);
      const pixelsPerMeter = pixelDistance / meters;
      
      // Calculate real width/height of the map based on the 1920x1080 default grid for now
      // Or if there's an image, based on image size. Let's assume 1920x1080 canvas for now.
      const realWidth = 1920 / pixelsPerMeter;
      const realHeight = 1080 / pixelsPerMeter;

      try {
        await supabase
          .from('floors')
          .update({ real_width_m: realWidth, real_height_m: realHeight })
          .eq('id', floorId);
        
        setFloorData(prev => ({ ...prev, real_width_m: realWidth, real_height_m: realHeight }));
        alert(`Scale calibrated! Map is now ${realWidth.toFixed(2)}m x ${realHeight.toFixed(2)}m.`);
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
    
    // Check if it already has a QR
    const existing = qrPoints.find(q => q.node_id === nodeId);
    if (existing) {
      if (confirm("This node already has a QR code assigned. Delete it?")) {
        await supabase.from('qr_points').delete().eq('id', existing.id);
        setQrPoints(qrPoints.filter(q => q.id !== existing.id));
      }
      return;
    }

    // Auto-generate URL
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
          onClick={() => navigate(-1)}
          className="pointer-events-auto flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Dashboard
        </button>
        <div className="ml-auto pointer-events-auto flex items-center gap-4">
          <span className="font-semibold">{floorData?.name || 'Map Editor'}</span>
          {floorData?.real_width_m && (
            <span className="text-xs bg-white/20 px-2 py-1 rounded">Scale Set</span>
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
        onSave={handleSave}
        onUploadPlan={handleUploadPlan}
      />

      {/* Canvas Area */}
      <CanvasManager 
        currentTool={currentTool}
        blueprintUrl={blueprintUrl}
        rooms={rooms}
        nodes={nodes}
        edges={edges}
        qrPoints={qrPoints}
        onRoomsChange={setRooms}
        onNodesChange={setNodes}
        onEdgesChange={setEdges}
        onScaleCalibrated={handleScaleCalibrated}
        onNodeQrClick={handleNodeQrClick}
      />
    </div>
  );
}
