import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ChevronDown, CheckCircle2, AlertTriangle, Compass, Route, Footprints, ArrowRight, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import MapToolbar from '../../components/map/MapToolbar';
import CanvasManager from '../../components/map/CanvasManager';
import ElementPropertiesPanel from '../../components/map/ElementPropertiesPanel';
import { ScaleCalibrationModal, BlueprintUploadModal } from '../../components/map/MapModals';
import { useMapHistory } from '../../hooks/useMapHistory';
import { validateGraph } from '../../lib/graphValidation';
import { findMultiFloorPath, findClosestNodeToRoom } from '../../lib/pathfinding';

const INITIAL_STATE = {
  rooms: [],
  nodes: [],
  edges: [],
  qrPoints: [],
  walls: [],
  doors: [],
  deletedRoomIds: [],
  deletedNodeIds: [],
  deletedEdgeIds: [],
  deletedWallIds: [],
  deletedDoorIds: [],
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

  // Layer visibility state
  const [layers, setLayers] = useState({
    walls: true,
    rooms: true,
    graph: true,
    blueprint: true,
  });

  // Door Corridor Node suggestion prompt state: { doorId, x, y }
  const [doorNodeSuggestion, setDoorNodeSuggestion] = useState(null);

  // Floor picker state
  const [allFloors, setAllFloors] = useState([]);
  const [showFloorPicker, setShowFloorPicker] = useState(false);

  // Graph Validation and Floor Connectors State
  const [showValidationDrawer, setShowValidationDrawer] = useState(false);
  const [floorConnectors, setFloorConnectors] = useState([]);
  const [allBuildingNodes, setAllBuildingNodes] = useState([]);
  const [allBuildingRooms, setAllBuildingRooms] = useState([]);
  const [allBuildingEdges, setAllBuildingEdges] = useState([]);

  // Route Simulation / Pathfinding Verification State
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [routeStart, setRouteStart] = useState({ floorId: '', type: 'room', id: '' });
  const [routeEnd, setRouteEnd] = useState({ floorId: '', type: 'room', id: '' });
  const [simulatedRoute, setSimulatedRoute] = useState(null);

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
    rooms = [],
    nodes = [],
    edges = [],
    qrPoints = [],
    walls = [],
    doors = [],
    deletedRoomIds = [],
    deletedNodeIds = [],
    deletedEdgeIds = [],
    deletedWallIds = [],
    deletedDoorIds = [],
  } = state;

  // Track unsaved changes
  const [savedHistoryMarker, setSavedHistoryMarker] = useState(0);
  const hasUnsavedChanges = historyLength !== savedHistoryMarker;

  // Unified Selection State: { type: 'room' | 'node' | 'edge' | null, id: string | null, ids: Set }
  const [selection, setSelection] = useState({ type: null, id: null, ids: new Set() });
  const [liveReshapingRoom, setLiveReshapingRoom] = useState(null);
  const handleSaveRef = useRef(null);

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

        // 6. Load Walls & Doors
        const { data: wallsData } = await supabase
          .from('walls')
          .select('*')
          .eq('floor_id', floorId);

        let doorsData = [];
        if (wallsData && wallsData.length > 0) {
          const wallIds = wallsData.map((w) => w.id);
          const { data: dd } = await supabase
            .from('doors')
            .select('*')
            .in('wall_id', wallIds);
          if (dd) doorsData = dd;
        }

        // 6b. Load Floor Connectors and all building nodes
        const { data: fcData } = await supabase
          .from('floor_connectors')
          .select('*');
        setFloorConnectors(fcData || []);

        if (floorsData && floorsData.length > 0) {
          const allFloorIds = floorsData.map((f) => f.id);
          const { data: bldgNodes } = await supabase
            .from('nodes')
            .select('id, floor_id, type, x, y, label')
            .in('floor_id', allFloorIds);
          setAllBuildingNodes(bldgNodes || []);

          const { data: bldgRooms } = await supabase
            .from('rooms')
            .select('id, floor_id, name, shape_data, category')
            .in('floor_id', allFloorIds);
          setAllBuildingRooms(bldgRooms || []);

          if (bldgNodes && bldgNodes.length > 0) {
            const bNodeIds = bldgNodes.map((n) => n.id);
            const { data: bldgEdges } = await supabase
              .from('edges')
              .select('*')
              .in('from_node', bNodeIds);
            setAllBuildingEdges(bldgEdges || []);
          }
        }

        // 7. Load Org Slug
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
          walls: wallsData || [],
          doors: doorsData || [],
          deletedRoomIds: [],
          deletedNodeIds: [],
          deletedEdgeIds: [],
          deletedWallIds: [],
          deletedDoorIds: [],
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

  // Real-time Graph Validation
  const graphValidation = useMemo(() => {
    return validateGraph({
      rooms,
      nodes,
      edges,
      walls,
      doors,
      pixelsPerMeter,
    });
  }, [rooms, nodes, edges, walls, doors, pixelsPerMeter]);

  // Selection Handler
  const handleSelect = useCallback(({ type, id, isMulti = false }) => {
    if (!id || !type) {
      setSelection({ type: null, id: null, ids: new Set(), items: [] });
      return;
    }

    setSelection((prev) => {
      if (isMulti) {
        const newIds = new Set(prev.ids || []);
        let newItems = [...(prev.items || [])];

        if (newIds.has(id)) {
          newIds.delete(id);
          newItems = newItems.filter((it) => it.id !== id);
        } else {
          newIds.add(id);
          newItems.push({ id, type });
        }

        const remainingIds = Array.from(newIds);
        const lastItem = newItems[newItems.length - 1];

        return {
          type: newItems.length > 1 ? 'multi' : lastItem ? lastItem.type : null,
          id: lastItem ? lastItem.id : null,
          ids: newIds,
          items: newItems,
        };
      }
      return { type, id, ids: new Set([id]), items: [{ id, type }] };
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

  // Update Walls
  const handleWallsChange = useCallback((updatedWalls) => {
    pushState((prev) => ({ ...prev, walls: updatedWalls }), 'Update walls');
  }, [pushState]);

  // Update Doors
  const handleDoorsChange = useCallback((updatedDoors) => {
    pushState((prev) => ({ ...prev, doors: updatedDoors }), 'Update doors');
  }, [pushState]);

  // Delete Handlers
  const handleDeleteRoom = useCallback((roomId) => {
    pushState((prev) => ({
      ...prev,
      rooms: prev.rooms.filter((r) => r.id !== roomId),
      deletedRoomIds: [...prev.deletedRoomIds, roomId],
    }), 'Delete room');
    setSelection({ type: null, id: null, ids: new Set(), items: [] });
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
    setSelection({ type: null, id: null, ids: new Set(), items: [] });
  }, [pushState]);

  const handleDeleteEdge = useCallback((edgeId) => {
    pushState((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== edgeId),
      deletedEdgeIds: [...prev.deletedEdgeIds, edgeId],
    }), 'Delete edge');
    setSelection({ type: null, id: null, ids: new Set(), items: [] });
  }, [pushState]);

  const handleDeleteWall = useCallback((wallId) => {
    pushState((prev) => {
      const remainingWalls = (prev.walls || []).filter((w) => w.id !== wallId);
      const childDoors = (prev.doors || []).filter((d) => d.wall_id === wallId);
      const childDoorIds = childDoors.map((d) => d.id);
      const remainingDoors = (prev.doors || []).filter((d) => d.wall_id !== wallId);

      return {
        ...prev,
        walls: remainingWalls,
        doors: remainingDoors,
        deletedWallIds: [...(prev.deletedWallIds || []), wallId],
        deletedDoorIds: [...(prev.deletedDoorIds || []), ...childDoorIds],
      };
    }, 'Delete wall');
    setSelection({ type: null, id: null, ids: new Set(), items: [] });
  }, [pushState]);

  const handleDeleteDoor = useCallback((doorId) => {
    pushState((prev) => ({
      ...prev,
      doors: (prev.doors || []).filter((d) => d.id !== doorId),
      deletedDoorIds: [...(prev.deletedDoorIds || []), doorId],
    }), 'Delete door');
    setSelection({ type: null, id: null, ids: new Set(), items: [] });
  }, [pushState]);

  // Door Node Suggestion Placement
  const handleAddDoorWithSuggestion = useCallback((newDoor, coords) => {
    pushState((prev) => ({
      ...prev,
      doors: [...(prev.doors || []), newDoor],
    }), 'Place door');

    if (coords && coords.x !== undefined && coords.y !== undefined) {
      setDoorNodeSuggestion({
        doorId: newDoor.id,
        x: coords.x,
        y: coords.y,
      });
    }
  }, [pushState]);

  const handleAcceptDoorNode = useCallback(() => {
    if (!doorNodeSuggestion) return;
    const newNode = {
      id: crypto.randomUUID(),
      floor_id: floorId,
      x: Math.round(doorNodeSuggestion.x),
      y: Math.round(doorNodeSuggestion.y),
      type: 'room_door',
    };
    pushState((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }), 'Add corridor node at door');
    setDoorNodeSuggestion(null);
  }, [doorNodeSuggestion, floorId, pushState]);

  const handleDismissDoorNode = useCallback(() => {
    setDoorNodeSuggestion(null);
  }, []);

  const handleToggleLayer = useCallback((layerId) => {
    setLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  }, []);

  // Delete Currently Selected Item(s)
  const handleDeleteSelected = useCallback(() => {
    if (!selection.id && (!selection.ids || selection.ids.size === 0)) return;

    const idsToDelete = selection.ids && selection.ids.size > 0
      ? Array.from(selection.ids)
      : [selection.id];

    pushState((prev) => {
      const remainingRooms = prev.rooms.filter((r) => !idsToDelete.includes(r.id));
      const newDeletedRoomIds = prev.rooms
        .filter((r) => idsToDelete.includes(r.id))
        .map((r) => r.id);

      const remainingNodes = prev.nodes.filter((n) => !idsToDelete.includes(n.id));
      const newDeletedNodeIds = prev.nodes
        .filter((n) => idsToDelete.includes(n.id))
        .map((n) => n.id);

      const remainingWalls = (prev.walls || []).filter((w) => !idsToDelete.includes(w.id));
      const newDeletedWallIds = (prev.walls || [])
        .filter((w) => idsToDelete.includes(w.id))
        .map((w) => w.id);

      const remainingDoors = (prev.doors || []).filter(
        (d) => !idsToDelete.includes(d.id) && !newDeletedWallIds.includes(d.wall_id)
      );
      const newDeletedDoorIds = (prev.doors || [])
        .filter((d) => idsToDelete.includes(d.id) || newDeletedWallIds.includes(d.wall_id))
        .map((d) => d.id);

      const connectedEdges = prev.edges.filter(
        (e) =>
          idsToDelete.includes(e.id) ||
          newDeletedNodeIds.includes(e.from_node) ||
          newDeletedNodeIds.includes(e.to_node)
      );
      const connectedEdgeIds = connectedEdges.map((e) => e.id);
      const remainingEdges = prev.edges.filter((e) => !connectedEdgeIds.includes(e.id));

      const remainingQr = prev.qrPoints.filter((q) => !newDeletedNodeIds.includes(q.node_id));

      return {
        ...prev,
        rooms: remainingRooms,
        nodes: remainingNodes,
        edges: remainingEdges,
        qrPoints: remainingQr,
        walls: remainingWalls,
        doors: remainingDoors,
        deletedRoomIds: [...(prev.deletedRoomIds || []), ...newDeletedRoomIds],
        deletedNodeIds: [...(prev.deletedNodeIds || []), ...newDeletedNodeIds],
        deletedEdgeIds: [...(prev.deletedEdgeIds || []), ...connectedEdgeIds],
        deletedWallIds: [...(prev.deletedWallIds || []), ...newDeletedWallIds],
        deletedDoorIds: [...(prev.deletedDoorIds || []), ...newDeletedDoorIds],
      };
    }, 'Delete selected item(s)');

    setSelection({ type: null, id: null, ids: new Set(), items: [] });
  }, [selection, pushState]);

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

      // Save: Ctrl+S / Cmd+S
      if (isCmdOrCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (handleSaveRef.current) handleSaveRef.current();
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
          case 'w':
            setCurrentTool('wall');
            break;
          case 'd':
            setCurrentTool('door');
            break;
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

      // Proportionally recalculate all edge weights to match new calibrated scale
      pushState((prev) => {
        const updatedEdges = prev.edges.map((e) => {
          const n1 = prev.nodes.find((n) => n.id === e.from_node);
          const n2 = prev.nodes.find((n) => n.id === e.to_node);
          if (!n1 || !n2) return e;
          const pDist = Math.hypot(n2.x - n1.x, n2.y - n1.y);
          return { ...e, weight: Math.round((pDist / ppm) * 100) / 100 };
        });
        return { ...prev, edges: updatedEdges };
      }, 'Recalibrate edge weights to new scale');
    } catch (err) {
      console.error('Error saving scale calibration:', err);
    } finally {
      setCalibrationPts(null);
      setCurrentTool('select');
    }
  };

  // Multi-Floor Connector Handlers
  const handleCreateConnector = async (nodeAId, nodeBId, type = 'stairs', weight = 30) => {
    try {
      const { data: newConn, error } = await supabase
        .from('floor_connectors')
        .insert([{ node_a: nodeAId, node_b: nodeBId, type, weight: parseFloat(weight) || 30 }])
        .select()
        .single();
      if (error) throw error;
      setFloorConnectors((prev) => [...prev, newConn]);
    } catch (err) {
      console.error('Failed to create floor connector:', err);
      alert('Failed to link floors: ' + (err.message || 'Unknown error'));
    }
  };

  const handleDeleteConnector = async (connectorId) => {
    try {
      const { error } = await supabase
        .from('floor_connectors')
        .delete()
        .eq('id', connectorId);
      if (error) throw error;
      setFloorConnectors((prev) => prev.filter((c) => c.id !== connectorId));
    } catch (err) {
      console.error('Failed to delete floor connector:', err);
      alert('Failed to remove floor connector: ' + (err.message || 'Unknown error'));
    }
  };

  // Route Simulation / Pathfinding Computation
  const handleComputeRoute = useCallback((s = routeStart, e = routeEnd) => {
    if (!s || !e || !s.id || !e.id) return;

    let startNodeId = s.id;
    if (s.type === 'room') {
      const room = allBuildingRooms.find((r) => r.id === s.id);
      const flNodes = allBuildingNodes.filter((n) => n.floor_id === (s.floorId || floorId));
      const closest = findClosestNodeToRoom(room, flNodes);
      startNodeId = closest?.id;
    }

    let endNodeId = e.id;
    if (e.type === 'room') {
      const room = allBuildingRooms.find((r) => r.id === e.id);
      const flNodes = allBuildingNodes.filter((n) => n.floor_id === (e.floorId || floorId));
      const closest = findClosestNodeToRoom(room, flNodes);
      endNodeId = closest?.id;
    }

    if (!startNodeId || !endNodeId) {
      setSimulatedRoute({ error: 'Could not find connected corridor node for the selected room.' });
      return;
    }

    const route = findMultiFloorPath({
      startId: startNodeId,
      endId: endNodeId,
      nodes: allBuildingNodes,
      edges: allBuildingEdges,
      floorConnectors: floorConnectors,
      floors: allFloors,
      pixelsPerMeter: floorData?.pixels_per_meter || 86.0,
    });

    if (route) {
      setSimulatedRoute(route);
    } else {
      setSimulatedRoute({ error: 'No walkable path found connecting these two locations.' });
    }
  }, [routeStart, routeEnd, allBuildingRooms, allBuildingNodes, allBuildingEdges, floorConnectors, allFloors, floorData, floorId]);

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
      if (deletedDoorIds.length > 0) {
        await supabase.from('doors').delete().in('id', deletedDoorIds);
      }
      if (deletedWallIds.length > 0) {
        await supabase.from('doors').delete().in('wall_id', deletedWallIds);
        await supabase.from('walls').delete().in('id', deletedWallIds);
      }
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

      // 2. Upsert Walls
      if (walls.length > 0) {
        const wallsToSave = walls.map((w) => ({
          id: w.id,
          floor_id: floorId,
          x1: w.x1,
          y1: w.y1,
          x2: w.x2,
          y2: w.y2,
          thickness: w.thickness || 12,
        }));
        const { error: wErr } = await supabase.from('walls').upsert(wallsToSave);
        if (wErr) throw wErr;
      }

      // 3. Upsert Doors
      if (doors.length > 0) {
        const doorsToSave = doors.map((d) => ({
          id: d.id,
          wall_id: d.wall_id,
          position_along_wall: d.position_along_wall,
          width: d.width || 40,
          swing_direction: d.swing_direction || 'right_in',
        }));
        const { error: dErr } = await supabase.from('doors').upsert(doorsToSave);
        if (dErr) throw dErr;
      }

      // 4. Upsert Rooms
      if (rooms.length > 0) {
        const roomsToSave = rooms.map((r) => ({ ...r, floor_id: floorId }));
        const { error: rErr } = await supabase.from('rooms').upsert(roomsToSave);
        if (rErr) throw rErr;
      }

      // 5. Upsert Nodes
      if (nodes.length > 0) {
        const nodesToSave = nodes.map((n) => ({ ...n, floor_id: floorId }));
        const { error: nErr } = await supabase.from('nodes').upsert(nodesToSave);
        if (nErr) throw nErr;
      }

      // 6. Compute accurate edge weights and upsert Edges
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

      // 7. Clear deletion queues in state and record saved history marker
      pushState((prev) => ({
        ...prev,
        deletedRoomIds: [],
        deletedNodeIds: [],
        deletedEdgeIds: [],
        deletedWallIds: [],
        deletedDoorIds: [],
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
  handleSaveRef.current = handleSave;

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
      <div className="absolute top-0 left-0 right-0 w-full h-16 bg-gradient-to-b from-black/85 via-black/50 to-transparent flex items-center justify-between px-6 z-20 pointer-events-none">
        <button
          onClick={() => navigate('/admin')}
          className="pointer-events-auto flex items-center gap-2 text-gray-300 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 text-sm font-medium cursor-pointer"
        >
          <ArrowLeft size={18} />
          Dashboard
        </button>

        <div className="pointer-events-auto flex items-center gap-3">
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
              Scale: {floorData.real_width_m.toFixed(1)}m ({((floorData.map_width || 1920) / floorData.real_width_m).toFixed(1)} px/m)
            </span>
          ) : (
            <button
              onClick={() => setCurrentTool('scale')}
              className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full hover:bg-amber-500/30 cursor-pointer font-medium"
            >
              ⚠️ Set Scale
            </button>
          )}

          {/* Non-Blocking Graph Validation Badge & Drawer */}
          <div className="relative pointer-events-auto">
            <button
              id="graph-validation-badge"
              onClick={() => setShowValidationDrawer((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                graphValidation.warnings.length === 0
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                  : 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 shadow-lg shadow-amber-500/10'
              }`}
              title="Click to view corridor graph connectivity & reachability warnings"
            >
              {graphValidation.warnings.length === 0 ? (
                <>
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span>Graph Valid</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={14} className="text-amber-400" />
                  <span>{graphValidation.warnings.length} Graph Warning{graphValidation.warnings.length > 1 ? 's' : ''}</span>
                </>
              )}
            </button>

            {/* Validation Warnings Dropdown Panel */}
            {showValidationDrawer && (
              <div
                id="graph-validation-drawer"
                className="absolute top-full right-0 mt-2 bg-[#0e0e16]/95 border border-white/15 rounded-2xl p-3 min-w-[320px] max-w-[380px] z-50 backdrop-blur-2xl shadow-2xl pointer-events-auto"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                    Graph Validation
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                    graphValidation.warnings.length === 0
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {graphValidation.warnings.length === 0 ? 'All Clear' : `${graphValidation.warnings.length} issue${graphValidation.warnings.length > 1 ? 's' : ''}`}
                  </span>
                </div>

                {graphValidation.warnings.length === 0 ? (
                  <div className="py-4 text-center text-xs text-gray-400">
                    <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-1.5" />
                    All rooms are reachable and corridor graph is fully connected.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {graphValidation.warnings.map((w) => (
                      <div
                        key={w.id}
                        className="p-2.5 rounded-xl bg-white/5 border border-white/8 hover:border-amber-500/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                            <AlertTriangle size={13} className="shrink-0" />
                            <span>{w.title}</span>
                          </div>
                          {w.elementId && (
                            <button
                              onClick={() => {
                                handleSelect({ type: w.elementType || 'room', id: w.elementId });
                                setShowValidationDrawer(false);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 cursor-pointer font-medium"
                            >
                              Focus
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                          {w.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Multi-Floor Route Simulation Button */}
          <button
            id="simulate-route-btn"
            onClick={() => {
              setShowRouteModal(!showRouteModal);
              setShowValidationDrawer(false);
              if (!simulatedRoute && allBuildingRooms.length > 0) {
                const curFlId = floorId;
                const otherFl = allFloors.find((f) => f.id !== curFlId);
                const curRooms = allBuildingRooms.filter((r) => r.floor_id === curFlId);
                const otherRooms = otherFl ? allBuildingRooms.filter((r) => r.floor_id === otherFl.id) : [];

                const s = { floorId: curFlId, type: 'room', id: curRooms[0]?.id || '' };
                const e = { floorId: otherFl?.id || curFlId, type: 'room', id: otherRooms[0]?.id || curRooms[1]?.id || '' };
                setRouteStart(s);
                setRouteEnd(e);
                handleComputeRoute(s, e);
              }
            }}
            className={`text-xs px-3 py-1.5 rounded-xl font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
              showRouteModal || (simulatedRoute && !simulatedRoute.error)
                ? 'bg-blue-600/30 border-blue-500/60 text-blue-300 shadow-lg shadow-blue-500/10'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300'
            }`}
            title="Simulate and verify multi-floor pathfinding between rooms and nodes"
          >
            <Compass size={14} className={simulatedRoute && !simulatedRoute.error ? 'text-blue-400' : 'text-gray-400'} />
            <span>{simulatedRoute && !simulatedRoute.error ? `Route: ${simulatedRoute.totalNodes} Nodes` : 'Simulate Route'}</span>
          </button>

          <button
            onClick={() => navigate(`/admin/buildings/${buildingId}/floors/${floorId}/print-qrs`)}
            className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer"
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
        layers={layers}
        onToggleLayer={handleToggleLayer}
      />

      {/* Interactive Konva Canvas */}
      <CanvasManager
        currentTool={currentTool}
        onSwitchTool={setCurrentTool}
        nodeType={nodeType}
        blueprintUrl={blueprintUrl}
        rooms={rooms}
        nodes={nodes}
        edges={edges}
        qrPoints={qrPoints}
        walls={walls}
        doors={doors}
        layers={layers}
        pixelsPerMeter={pixelsPerMeter}
        selection={selection}
        onSelect={handleSelect}
        onRoomsChange={handleRoomsChange}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onWallsChange={handleWallsChange}
        onDoorsChange={handleDoorsChange}
        onAddDoorWithSuggestion={handleAddDoorWithSuggestion}
        onScaleCalibrated={handleScaleCalibrated}
        onNodeQrClick={handleToggleQr}
        onDeleteSelected={handleDeleteSelected}
        gridVisible={gridVisible}
        gridSize={gridSize}
        snapEnabled={snapEnabled}
        onRoomLiveUpdate={setLiveReshapingRoom}
        routeHighlightNodeIds={simulatedRoute?.path || []}
      />

      {/* Unified Element Properties Inspector Panel */}
      <ElementPropertiesPanel
        selection={selection}
        rooms={liveReshapingRoom ? rooms.map((r) => (r.id === liveReshapingRoom.id ? { ...r, shape_data: liveReshapingRoom.shape_data } : r)) : rooms}
        nodes={nodes}
        edges={edges}
        qrPoints={qrPoints}
        walls={walls}
        doors={doors}
        pixelsPerMeter={pixelsPerMeter}
        allFloors={allFloors}
        allBuildingNodes={allBuildingNodes}
        floorConnectors={floorConnectors}
        currentFloorId={floorId}
        onCreateConnector={handleCreateConnector}
        onDeleteConnector={handleDeleteConnector}
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
        onUpdateWall={(updatedWall) => {
          pushState((prev) => ({
            ...prev,
            walls: (prev.walls || []).map((w) => (w.id === updatedWall.id ? updatedWall : w)),
          }), 'Update wall properties');
        }}
        onDeleteWall={handleDeleteWall}
        onUpdateDoor={(updatedDoor) => {
          pushState((prev) => ({
            ...prev,
            doors: (prev.doors || []).map((d) => (d.id === updatedDoor.id ? updatedDoor : d)),
          }), 'Update door properties');
        }}
        onDeleteDoor={handleDeleteDoor}
        onAddNodeAtDoor={(door) => {
          const parentWall = (walls || []).find((w) => w.id === door.wall_id);
          if (!parentWall) return;
          const t = door.position_along_wall;
          const doorX = parentWall.x1 + t * (parentWall.x2 - parentWall.x1);
          const doorY = parentWall.y1 + t * (parentWall.y2 - parentWall.y1);
          const newNode = {
            id: crypto.randomUUID(),
            floor_id: floorId,
            x: Math.round(doorX),
            y: Math.round(doorY),
            type: 'room_door',
          };
          pushState((prev) => ({
            ...prev,
            nodes: [...prev.nodes, newNode],
          }), 'Add corridor node at door');
        }}
        onDeleteSelected={handleDeleteSelected}
        onToggleQr={handleToggleQr}
        onClose={() => setSelection({ type: null, id: null, ids: new Set(), items: [] })}
      />

      {/* Floating Prompt: Add Corridor Node at Door */}
      {doorNodeSuggestion && (
        <div className="absolute bottom-6 right-6 z-40 bg-[#0d0d14]/95 border border-blue-500/40 backdrop-blur-2xl rounded-2xl p-4 shadow-2xl flex items-center gap-4 animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🚪</span>
            <div>
              <div className="text-sm font-semibold text-white">Door Placed</div>
              <div className="text-xs text-gray-400">Add a corridor node at this door position?</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAcceptDoorNode}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors cursor-pointer"
            >
              Add Node
            </button>
            <button
              onClick={handleDismissDoorNode}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white rounded-xl text-xs font-medium transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

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

      {/* Route Simulation / Multi-Floor Pathfinding Modal */}
      {showRouteModal && (
        <div id="route-simulation-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0f172a] border border-blue-500/30 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-2.5">
                <Compass className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-white text-base">Multi-Floor Route Simulator</h3>
              </div>
              <button
                onClick={() => setShowRouteModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Origin and Destination pickers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Start Location Card */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Start Origin</span>
                    <span className="text-[11px] text-gray-400">Step 1</span>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1 font-medium">Floor</label>
                    <select
                      value={routeStart.floorId || floorId}
                      onChange={(e) => {
                        const newFl = e.target.value;
                        const flRooms = allBuildingRooms.filter((r) => r.floor_id === newFl);
                        const s = { floorId: newFl, type: 'room', id: flRooms[0]?.id || '' };
                        setRouteStart(s);
                        handleComputeRoute(s, routeEnd);
                      }}
                      className="w-full text-xs px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500"
                    >
                      {allFloors.map((f) => (
                        <option key={f.id} value={f.id}>{f.name} (Level {f.level})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1 font-medium">Room</label>
                    <select
                      value={routeStart.id}
                      onChange={(e) => {
                        const s = { ...routeStart, id: e.target.value };
                        setRouteStart(s);
                        handleComputeRoute(s, routeEnd);
                      }}
                      className="w-full text-xs px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500"
                    >
                      <option value="">Select Starting Room...</option>
                      {allBuildingRooms
                        .filter((r) => r.floor_id === (routeStart.floorId || floorId))
                        .map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Destination Location Card */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Destination</span>
                    <span className="text-[11px] text-gray-400">Final Target</span>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1 font-medium">Floor</label>
                    <select
                      value={routeEnd.floorId}
                      onChange={(e) => {
                        const newFl = e.target.value;
                        const flRooms = allBuildingRooms.filter((r) => r.floor_id === newFl);
                        const endObj = { floorId: newFl, type: 'room', id: flRooms[0]?.id || '' };
                        setRouteEnd(endObj);
                        handleComputeRoute(routeStart, endObj);
                      }}
                      className="w-full text-xs px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500"
                    >
                      {allFloors.map((f) => (
                        <option key={f.id} value={f.id}>{f.name} (Level {f.level})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1 font-medium">Room</label>
                    <select
                      value={routeEnd.id}
                      onChange={(e) => {
                        const endObj = { ...routeEnd, id: e.target.value };
                        setRouteEnd(endObj);
                        handleComputeRoute(routeStart, endObj);
                      }}
                      className="w-full text-xs px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500"
                    >
                      <option value="">Select Destination Room...</option>
                      {allBuildingRooms
                        .filter((r) => r.floor_id === routeEnd.floorId)
                        .map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Route Computation Results */}
              {simulatedRoute && (
                <div className="space-y-4">
                  {simulatedRoute.error ? (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                      <AlertTriangle size={16} className="shrink-0" />
                      <span>{simulatedRoute.error}</span>
                    </div>
                  ) : (
                    <>
                      {/* Summary Badges */}
                      <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 font-semibold">
                          ✓ {simulatedRoute.totalNodes} Nodes in Path
                        </span>
                        {simulatedRoute.crossesFloors ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-semibold flex items-center gap-1">
                            🪜 Crosses {simulatedRoute.floorSegments.length} Floors via {simulatedRoute.connectorsUsed?.map((c) => c.type.toUpperCase()).join(', ') || 'STAIRS'}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 font-semibold">
                            Single Floor Route
                          </span>
                        )}
                        <span className="text-gray-400 ml-auto text-[11px]">
                          Route highlighted on canvas
                        </span>
                      </div>

                      {/* Turn-by-Turn Path Sequence */}
                      <div id="route-node-sequence-list" className="rounded-2xl bg-black/40 border border-white/10 p-3 max-h-[240px] overflow-y-auto space-y-1.5">
                        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                          Turn-by-Turn Path Sequence:
                        </div>
                        {simulatedRoute.pathNodes?.map((n, idx) => {
                          const fl = allFloors.find((f) => f.id === n.floor_id);
                          const prev = idx > 0 ? simulatedRoute.pathNodes[idx - 1] : null;
                          const crossesHere = prev && prev.floor_id !== n.floor_id;

                          return (
                            <div key={n.id} className="space-y-1.5">
                              {crossesHere && (
                                <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-2 my-1 shadow-md">
                                  <span className="text-base">🪜</span>
                                  <span>CROSS-FLOOR CONNECTOR: {allFloors.find(f => f.id === prev.floor_id)?.name || 'Floor 1'} ➔ {fl?.name || 'Floor 2'} via STAIRS</span>
                                </div>
                              )}
                              <div className={`p-2 rounded-xl text-xs flex items-center justify-between ${
                                n.floor_id === floorId ? 'bg-blue-500/15 border border-blue-500/30 text-blue-200' : 'bg-white/5 border border-white/5 text-gray-300'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-white/10 text-gray-300 flex items-center justify-center text-[10px] font-bold">
                                    {idx + 1}
                                  </span>
                                  <span className="font-semibold text-white">
                                    {n.type === 'stairs' ? '🪜 Stairs Node' : n.type === 'room_door' ? '🚪 Door Node' : 'Corridor Node'}
                                  </span>
                                  <span className="text-[11px] text-gray-400">
                                    ({fl?.name || 'Floor'})
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono text-gray-400">
                                  Node ID: {n.id.slice(0, 8)}... at ({n.x}, {n.y})
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Quick Floor View Switches */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">Switch Floor View:</span>
                          {simulatedRoute.floorSegments?.map((seg) => (
                            <button
                              key={seg.floorId}
                              onClick={() => {
                                navigate(`/admin/buildings/${buildingId}/floors/${seg.floorId}/editor`);
                              }}
                              className={`text-xs px-3 py-1.5 rounded-xl font-medium border cursor-pointer transition-colors ${
                                seg.floorId === floorId
                                  ? 'bg-blue-600 text-white border-blue-500'
                                  : 'bg-white/10 hover:bg-white/20 text-gray-300 border-white/10'
                              }`}
                            >
                              {seg.floorName} {seg.floorId === floorId ? '(Active Canvas)' : ''}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setSimulatedRoute(null)}
                          className="text-xs text-gray-400 hover:text-red-400 cursor-pointer"
                        >
                          Clear Route
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
