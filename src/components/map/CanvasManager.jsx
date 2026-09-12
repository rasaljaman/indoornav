import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Group, Text, Shape } from 'react-konva';
import { Maximize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

// Node type visual config
const NODE_STYLES = {
  junction:  { fill: '#FFFFFF', stroke: '#1A73E8', label: 'J' },
  stairs:    { fill: '#FED7AA', stroke: '#F97316', label: 'S' },
  lift:      { fill: '#DDD6FE', stroke: '#8B5CF6', label: 'L' },
  entrance:  { fill: '#FECACA', stroke: '#EF4444', label: 'E' },
  room_door: { fill: '#BBF7D0', stroke: '#10B981', label: 'D' },
};

// Google Maps Aesthetic Theme
const THEME = {
  background: '#EFE9E1',
  grid: 'rgba(0, 0, 0, 0.08)',
  guideLine: '#06B6D4', // Cyan alignment line
  rooms: {
    washroom: { fill: '#BDE3F4', stroke: '#90C7DF' },
    entrance: { fill: '#F9E5A3', stroke: '#E3C966' },
    stairs: { fill: '#D3D3D3', stroke: '#A9A9A9' },
    lift: { fill: '#D3D3D3', stroke: '#A9A9A9' },
    office: { fill: '#F2ECE4', stroke: '#E8EAED' },
    department: { fill: '#E6E1D8', stroke: '#D7D1C6' },
    lab: { fill: '#F2ECE4', stroke: '#E8EAED' },
    other: { fill: '#F8F9FA', stroke: '#E8EAED' }
  },
  path: {
    color: '#8AB4F8',
    width: 6,
    outline: '#FFFFFF',
    outlineWidth: 10,
    selectedOutline: '#3B82F6',
  }
};

export default function CanvasManager({
  currentTool,
  nodeType = 'junction',
  blueprintUrl,
  rooms = [],
  nodes = [],
  edges = [],
  qrPoints = [],
  selection = { type: null, id: null, ids: new Set() },
  onSelect, // ({ type, id, isMulti }) => void
  onRoomsChange,
  onNodesChange,
  onEdgesChange,
  onScaleCalibrated,
  onNodeQrClick,
  onDeleteSelected,
  onCommitHistory, // push snapshot to history
  gridVisible = true,
  gridSize = 20,
  snapEnabled = true,
}) {
  const stageRef = useRef(null);
  const containerRef = useRef(null);

  // Window / Container Dimensions
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Dynamic resize
  useEffect(() => {
    function handleResize() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth || window.innerWidth,
          height: containerRef.current.offsetHeight || window.innerHeight,
        });
      } else {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [image, setImage] = useState(null);

  // Viewport State (Zoom & Pan)
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Spacebar pan state
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isMiddleMouseDown, setIsMiddleMouseDown] = useState(false);

  // Touch tracking for pinch-to-zoom & two-finger drag
  const lastCenter = useRef(null);
  const lastDist = useRef(0);

  // Drawing State
  const [currentRoomPts, setCurrentRoomPts] = useState([]);
  const [currentScalePts, setCurrentScalePts] = useState([]);
  const [edgeStartNodeId, setEdgeStartNodeId] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Smart Alignment Guides State: [{ orientation: 'v'|'h', pos: number }]
  const [activeGuides, setActiveGuides] = useState([]);

  // Load Blueprint Image
  useEffect(() => {
    if (!blueprintUrl) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.src = blueprintUrl;
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
  }, [blueprintUrl]);

  // Track Spacebar key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.code === 'Space' && !e.repeat) {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setIsSpacePressed(true);
        }
      }
    }
    function handleKeyUp(e) {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Snapping helper
  const snapCoord = useCallback((val) => {
    if (!snapEnabled || !gridSize || gridSize <= 0) return val;
    return Math.round(val / gridSize) * gridSize;
  }, [snapEnabled, gridSize]);

  // Compute Alignment Guides
  const getAlignmentCandidates = useCallback((excludeId, excludeType) => {
    const xTargets = [];
    const yTargets = [];

    // Collect from other nodes
    nodes.forEach((n) => {
      if (excludeType === 'node' && n.id === excludeId) return;
      xTargets.push({ pos: n.x, label: 'Node' });
      yTargets.push({ pos: n.y, label: 'Node' });
    });

    // Collect from rooms
    rooms.forEach((r) => {
      if (excludeType === 'room' && r.id === excludeId) return;
      if (!r.shape_data || r.shape_data.length < 4) return;
      const xs = [];
      const ys = [];
      for (let i = 0; i < r.shape_data.length; i += 2) {
        xs.push(r.shape_data[i]);
        ys.push(r.shape_data[i + 1]);
      }
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const midX = (minX + maxX) / 2;
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const midY = (minY + maxY) / 2;

      xTargets.push({ pos: minX, label: 'Room Edge' });
      xTargets.push({ pos: midX, label: 'Room Center' });
      xTargets.push({ pos: maxX, label: 'Room Edge' });

      yTargets.push({ pos: minY, label: 'Room Edge' });
      yTargets.push({ pos: midY, label: 'Room Center' });
      yTargets.push({ pos: maxY, label: 'Room Edge' });
    });

    return { xTargets, yTargets };
  }, [nodes, rooms]);

  // Zoom centered on pointer
  const zoomAtPointer = useCallback((newScale, pointerPos) => {
    const stage = stageRef.current;
    if (!stage) return;

    const clampedScale = Math.min(Math.max(newScale, 0.1), 10);
    const oldScale = stage.scaleX();
    const pointer = pointerPos || stage.getPointerPosition() || {
      x: dimensions.width / 2,
      y: dimensions.height / 2,
    };

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    setScale(clampedScale);
    setPosition(newPos);
  }, [dimensions]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const scaleBy = 1.12;
    const oldScale = stage.scaleX();
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    zoomAtPointer(newScale, stage.getPointerPosition());
  }, [zoomAtPointer]);

  // Touch handlers for multi-touch pinch zoom & pan
  const handleTouchMove = (e) => {
    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];

    if (touch1 && touch2) {
      e.evt.preventDefault();
      const dist = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      const center = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      };

      if (!lastDist.current) {
        lastDist.current = dist;
        lastCenter.current = center;
        return;
      }

      const pointTo = {
        x: (center.x - position.x) / scale,
        y: (center.y - position.y) / scale,
      };

      const scaleChange = dist / lastDist.current;
      const newScale = Math.min(Math.max(scale * scaleChange, 0.1), 10);

      const dx = center.x - (lastCenter.current?.x || center.x);
      const dy = center.y - (lastCenter.current?.y || center.y);

      setScale(newScale);
      setPosition({
        x: center.x - pointTo.x * newScale + dx,
        y: center.y - pointTo.y * newScale + dy,
      });

      lastDist.current = dist;
      lastCenter.current = center;
    }
  };

  const handleTouchEnd = () => {
    lastDist.current = 0;
    lastCenter.current = null;
  };

  // Fit to screen / Reset View
  const handleFitToScreen = useCallback(() => {
    // Collect bounds of all elements
    const allX = [];
    const allY = [];

    rooms.forEach((r) => {
      if (!r.shape_data) return;
      for (let i = 0; i < r.shape_data.length; i += 2) {
        allX.push(r.shape_data[i]);
        allY.push(r.shape_data[i + 1]);
      }
    });

    nodes.forEach((n) => {
      allX.push(n.x);
      allY.push(n.y);
    });

    if (image) {
      allX.push(0, image.width);
      allY.push(0, image.height);
    }

    if (allX.length === 0) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      return;
    }

    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    const padding = 60;
    const contentW = Math.max(maxX - minX, 100);
    const contentH = Math.max(maxY - minY, 100);

    const fitScaleX = (dimensions.width - padding * 2) / contentW;
    const fitScaleY = (dimensions.height - padding * 2) / contentH;
    const fitScale = Math.min(Math.max(Math.min(fitScaleX, fitScaleY), 0.2), 3);

    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;

    setScale(fitScale);
    setPosition({
      x: dimensions.width / 2 - contentCenterX * fitScale,
      y: dimensions.height / 2 - contentCenterY * fitScale,
    });
  }, [rooms, nodes, image, dimensions]);

  // Stage mouse events
  const handleMouseDown = (e) => {
    if (e.evt.button === 1) {
      // Middle mouse button pressed
      setIsMiddleMouseDown(true);
    }
  };

  const handleMouseUp = (e) => {
    if (e.evt.button === 1) {
      setIsMiddleMouseDown(false);
    }
  };

  const handleMouseMove = (e) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return;

    const canvasX = (pointerPosition.x - stage.x()) / stage.scaleX();
    const canvasY = (pointerPosition.y - stage.y()) / stage.scaleY();

    setMousePos({ x: canvasX, y: canvasY });
  };

  // Stage DragEnd: sync stage position state so zooming never jumps
  const handleStageDragEnd = (e) => {
    if (e.target === stageRef.current) {
      setPosition({ x: e.target.x(), y: e.target.y() });
    }
  };

  // Canvas Click (handling tools)
  const handleStageClick = (e) => {
    // Ignore middle-click or right-click
    if (e.evt.button === 1 || e.evt.button === 2) return;
    // Don't draw if space is pressed for panning
    if (isSpacePressed || isMiddleMouseDown) return;

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return;

    let rawX = (pointerPosition.x - stage.x()) / stage.scaleX();
    let rawY = (pointerPosition.y - stage.y()) / stage.scaleY();

    const x = snapCoord(rawX);
    const y = snapCoord(rawY);

    if (currentTool === 'room') {
      setCurrentRoomPts([...currentRoomPts, x, y]);
    } else if (currentTool === 'node') {
      const newNode = {
        id: crypto.randomUUID(),
        x,
        y,
        type: nodeType,
      };
      const updatedNodes = [...nodes, newNode];
      onNodesChange(updatedNodes);
      onCommitHistory({ nodes: updatedNodes });
    } else if (currentTool === 'scale') {
      const newPts = [...currentScalePts, x, y];
      if (newPts.length === 4) {
        onScaleCalibrated(newPts);
        setCurrentScalePts([]);
      } else {
        setCurrentScalePts(newPts);
      }
    } else if (currentTool === 'select') {
      // Clicked empty stage -> deselect everything
      if (e.target === stage || e.target.getParent() === stage) {
        onSelect({ type: null, id: null });
      }
    }
  };

  // Double click closes Room Polygon
  const handleStageDblClick = () => {
    if (currentTool === 'room' && currentRoomPts.length >= 6) {
      const newRoom = {
        id: crypto.randomUUID(),
        name: 'New Room',
        category: 'other',
        shape_data: currentRoomPts,
        color: null,
      };
      const updatedRooms = [...rooms, newRoom];
      onRoomsChange(updatedRooms);
      onCommitHistory({ rooms: updatedRooms });
      setCurrentRoomPts([]);
      // Select the newly drawn room
      onSelect({ type: 'room', id: newRoom.id });
    }
  };

  // Select handlers
  const handleRoomClick = (e, roomId) => {
    e.cancelBubble = true;
    if (currentTool === 'select') {
      onSelect({
        type: 'room',
        id: roomId,
        isMulti: e.evt?.shiftKey || false,
      });
    }
  };

  const handleNodeClick = (e, node) => {
    e.cancelBubble = true;
    if (currentTool === 'edge') {
      if (!edgeStartNodeId) {
        setEdgeStartNodeId(node.id);
      } else {
        if (edgeStartNodeId !== node.id) {
          // Check if edge already exists
          const exists = edges.some(
            (edge) =>
              (edge.from_node === edgeStartNodeId && edge.to_node === node.id) ||
              (edge.from_node === node.id && edge.to_node === edgeStartNodeId)
          );
          if (!exists) {
            const newEdge = {
              id: crypto.randomUUID(),
              from_node: edgeStartNodeId,
              to_node: node.id,
              weight: 0,
            };
            const updatedEdges = [...edges, newEdge];
            onEdgesChange(updatedEdges);
            onCommitHistory({ edges: updatedEdges });
          }
        }
        setEdgeStartNodeId(null);
      }
    } else if (currentTool === 'qr') {
      onNodeQrClick(node.id);
    } else if (currentTool === 'select') {
      onSelect({
        type: 'node',
        id: node.id,
        isMulti: e.evt?.shiftKey || false,
      });
    }
  };

  const handleEdgeClick = (e, edgeId) => {
    e.cancelBubble = true;
    if (currentTool === 'select') {
      onSelect({
        type: 'edge',
        id: edgeId,
        isMulti: e.evt?.shiftKey || false,
      });
    }
  };

  // ==========================================
  // DRAGGING LOGIC WITH SNAPPING & GUIDES
  // ==========================================

  // Drag Node
  const handleNodeDragMove = (e, nodeId) => {
    const stage = stageRef.current;
    if (!stage) return;

    let targetX = e.target.x();
    let targetY = e.target.y();

    // 1. Grid snapping
    targetX = snapCoord(targetX);
    targetY = snapCoord(targetY);

    // 2. Smart Alignment Snapping
    const guides = [];
    const threshold = 6 / scale;
    const { xTargets, yTargets } = getAlignmentCandidates(nodeId, 'node');

    for (const cand of xTargets) {
      if (Math.abs(targetX - cand.pos) <= threshold) {
        targetX = cand.pos;
        guides.push({ orientation: 'v', pos: cand.pos });
        break;
      }
    }

    for (const cand of yTargets) {
      if (Math.abs(targetY - cand.pos) <= threshold) {
        targetY = cand.pos;
        guides.push({ orientation: 'h', pos: cand.pos });
        break;
      }
    }

    e.target.x(targetX);
    e.target.y(targetY);
    setActiveGuides(guides);

    // Live update nodes in state so connected edges re-render in real time!
    const updated = nodes.map((n) => (n.id === nodeId ? { ...n, x: targetX, y: targetY } : n));
    onNodesChange(updated);
  };

  const handleNodeDragEnd = (e, nodeId) => {
    setActiveGuides([]);
    const targetX = e.target.x();
    const targetY = e.target.y();
    const updated = nodes.map((n) => (n.id === nodeId ? { ...n, x: targetX, y: targetY } : n));
    onNodesChange(updated);
    onCommitHistory({ nodes: updated });
  };

  // Drag Room
  const handleRoomDragMove = (e, roomId) => {
    const stage = stageRef.current;
    if (!stage) return;

    const room = rooms.find((r) => r.id === roomId);
    if (!room || !room.shape_data) return;

    // e.target is the Group containing the room
    let groupDx = e.target.x();
    let groupDy = e.target.y();

    // Calculate room center
    const center = getPolygonCenter(room.shape_data);
    let candidateCenterX = center.x + groupDx;
    let candidateCenterY = center.y + groupDy;

    // Grid snap on room center
    const snappedCenterX = snapCoord(candidateCenterX);
    const snappedCenterY = snapCoord(candidateCenterY);
    groupDx += (snappedCenterX - candidateCenterX);
    groupDy += (snappedCenterY - candidateCenterY);

    // Alignment guides
    const guides = [];
    const threshold = 6 / scale;
    const { xTargets, yTargets } = getAlignmentCandidates(roomId, 'room');

    for (const cand of xTargets) {
      if (Math.abs(snappedCenterX - cand.pos) <= threshold) {
        groupDx += (cand.pos - snappedCenterX);
        guides.push({ orientation: 'v', pos: cand.pos });
        break;
      }
    }

    for (const cand of yTargets) {
      if (Math.abs(snappedCenterY - cand.pos) <= threshold) {
        groupDy += (cand.pos - snappedCenterY);
        guides.push({ orientation: 'h', pos: cand.pos });
        break;
      }
    }

    e.target.x(groupDx);
    e.target.y(groupDy);
    setActiveGuides(guides);
  };

  const handleRoomDragEnd = (e, roomId) => {
    setActiveGuides([]);
    const groupDx = e.target.x();
    const groupDy = e.target.y();

    // Reset group coordinates
    e.target.x(0);
    e.target.y(0);

    if (groupDx === 0 && groupDy === 0) return;

    // Apply offset to all shape points
    const updatedRooms = rooms.map((r) => {
      if (r.id === roomId && r.shape_data) {
        const shiftedPts = r.shape_data.map((val, idx) => (idx % 2 === 0 ? val + groupDx : val + groupDy));
        return { ...r, shape_data: shiftedPts };
      }
      return r;
    });

    onRoomsChange(updatedRooms);
    onCommitHistory({ rooms: updatedRooms });
  };

  // Helper: polygon center
  function getPolygonCenter(pts) {
    let cx = 0, cy = 0;
    const count = pts.length / 2;
    for (let i = 0; i < pts.length; i += 2) {
      cx += pts[i];
      cy += pts[i + 1];
    }
    return { x: cx / count, y: cy / count };
  }

  // Determine stage draggability and cursor
  const isStageDraggable = isSpacePressed || isMiddleMouseDown || currentTool === 'select';
  const getCursor = () => {
    if (isSpacePressed || isMiddleMouseDown) return 'grabbing';
    if (currentTool === 'select') return 'default';
    return 'crosshair';
  };

  // Render Grid Layer efficiently using a single Konva Shape
  const renderGrid = useMemo(() => {
    if (!gridVisible) return null;

    return (
      <Shape
        sceneFunc={(context, shape) => {
          const step = gridSize || 20;
          const stageX = position.x;
          const stageY = position.y;
          const stageScale = scale;

          // Compute visible canvas rect in world coordinates
          const viewWidth = dimensions.width / stageScale;
          const viewHeight = dimensions.height / stageScale;
          const startX = Math.floor((-stageX / stageScale) / step) * step;
          const startY = Math.floor((-stageY / stageScale) / step) * step;
          const endX = startX + viewWidth + step * 2;
          const endY = startY + viewHeight + step * 2;

          context.beginPath();

          // Draw vertical lines
          for (let gx = startX; gx <= endX; gx += step) {
            context.moveTo(gx, startY);
            context.lineTo(gx, endY);
          }

          // Draw horizontal lines
          for (let gy = startY; gy <= endY; gy += step) {
            context.moveTo(startX, gy);
            context.lineTo(endX, gy);
          }

          context.strokeStyle = THEME.grid;
          context.lineWidth = 1 / stageScale;
          context.stroke();
        }}
        listening={false}
      />
    );
  }, [gridVisible, gridSize, position, scale, dimensions]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden select-none"
      style={{
        backgroundColor: THEME.background,
        cursor: getCursor(),
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        draggable={isStageDraggable}
        onDragEnd={handleStageDragEnd}
        x={position.x}
        y={position.y}
        scaleX={scale}
        scaleY={scale}
        onClick={handleStageClick}
        onDblClick={handleStageDblClick}
      >
        {/* 1. GRID LAYER */}
        <Layer>{renderGrid}</Layer>

        {/* 2. BLUEPRINT BACKGROUND LAYER */}
        <Layer>
          {image && <KonvaImage image={image} opacity={0.65} listening={false} />}
        </Layer>

        {/* 3. ROOMS LAYER */}
        <Layer>
          {rooms.map((room) => {
            const style = THEME.rooms[room.category] || THEME.rooms.other;
            const isSelected =
              selection.id === room.id || selection.ids?.has(room.id);
            const center =
              room.shape_data?.length >= 6 ? getPolygonCenter(room.shape_data) : null;

            return (
              <Group
                key={room.id}
                draggable={currentTool === 'select'}
                onClick={(e) => handleRoomClick(e, room.id)}
                onTap={(e) => handleRoomClick(e, room.id)}
                onDragMove={(e) => handleRoomDragMove(e, room.id)}
                onDragEnd={(e) => handleRoomDragEnd(e, room.id)}
              >
                <Line
                  points={room.shape_data}
                  fill={room.color || style.fill}
                  stroke={isSelected ? '#2563EB' : style.stroke}
                  strokeWidth={(isSelected ? 3.5 : 2) / scale}
                  closed
                  opacity={0.92}
                  dash={isSelected ? [8 / scale, 4 / scale] : undefined}
                  hitStrokeWidth={12 / scale}
                  shadowColor={isSelected ? '#3B82F6' : undefined}
                  shadowBlur={isSelected ? 10 : 0}
                  shadowOpacity={0.6}
                />
                {center && (
                  <Text
                    x={center.x}
                    y={center.y}
                    text={room.name}
                    fontSize={13 / scale}
                    fill="#1F2937"
                    align="center"
                    offsetX={(room.name.length * 3.6) / scale}
                    offsetY={7 / scale}
                    fontFamily="Inter, sans-serif"
                    fontStyle="600"
                    listening={false}
                  />
                )}
              </Group>
            );
          })}

          {/* Active Room Drawing Line */}
          {currentRoomPts.length > 0 && (
            <Line
              points={currentRoomPts}
              stroke="#2563EB"
              strokeWidth={3 / scale}
              dash={[8 / scale, 4 / scale]}
              closed={false}
            />
          )}

          {/* Active Scale Calibration Line */}
          {currentScalePts.length > 0 && (
            <Line
              points={currentScalePts}
              stroke="#DC2626"
              strokeWidth={4 / scale}
              dash={[6 / scale, 4 / scale]}
              closed={false}
            />
          )}
        </Layer>

        {/* 4. GRAPH LAYER (Edges & Nodes) */}
        <Layer>
          {/* Edges */}
          {edges.map((edge) => {
            const n1 = nodes.find((n) => n.id === edge.from_node);
            const n2 = nodes.find((n) => n.id === edge.to_node);
            if (!n1 || !n2) return null;

            const isSelected =
              selection.id === edge.id || selection.ids?.has(edge.id);

            return (
              <Group key={edge.id} onClick={(e) => handleEdgeClick(e, edge.id)}>
                {/* Edge Outline */}
                <Line
                  points={[n1.x, n1.y, n2.x, n2.y]}
                  stroke={isSelected ? THEME.path.selectedOutline : THEME.path.outline}
                  strokeWidth={(THEME.path.outlineWidth + (isSelected ? 4 : 0)) / scale}
                  lineCap="round"
                  lineJoin="round"
                  hitStrokeWidth={16 / scale}
                />
                {/* Edge Core */}
                <Line
                  points={[n1.x, n1.y, n2.x, n2.y]}
                  stroke={isSelected ? '#2563EB' : THEME.path.color}
                  strokeWidth={THEME.path.width / scale}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              </Group>
            );
          })}

          {/* Active edge in-progress line */}
          {currentTool === 'edge' && edgeStartNodeId && (
            <Line
              points={[
                nodes.find((n) => n.id === edgeStartNodeId)?.x || 0,
                nodes.find((n) => n.id === edgeStartNodeId)?.y || 0,
                mousePos.x,
                mousePos.y,
              ]}
              stroke={THEME.path.color}
              strokeWidth={THEME.path.width / scale}
              dash={[5 / scale, 5 / scale]}
              listening={false}
            />
          )}

          {/* Nodes */}
          {nodes.map((node) => {
            const hasQr = qrPoints.some((q) => q.node_id === node.id);
            const ns = NODE_STYLES[node.type] || NODE_STYLES.junction;
            const isSelected =
              selection.id === node.id || selection.ids?.has(node.id);
            const isConnectingEdge = edgeStartNodeId === node.id;

            return (
              <Group
                key={node.id}
                x={node.x}
                y={node.y}
                draggable={currentTool === 'select'}
                onClick={(e) => handleNodeClick(e, node)}
                onTap={(e) => handleNodeClick(e, node)}
                onDragMove={(e) => handleNodeDragMove(e, node.id)}
                onDragEnd={(e) => handleNodeDragEnd(e, node.id)}
              >
                {/* Node halo if selected or active edge */}
                {(isSelected || isConnectingEdge) && (
                  <Circle
                    radius={14 / scale}
                    fill="rgba(59, 130, 246, 0.25)"
                    stroke="#2563EB"
                    strokeWidth={1.5 / scale}
                    listening={false}
                  />
                )}

                {/* Main Node Circle */}
                <Circle
                  radius={(isConnectingEdge || isSelected ? 8.5 : 6.5) / scale}
                  fill={isConnectingEdge ? THEME.path.color : hasQr ? '#8B5CF6' : ns.fill}
                  stroke={hasQr ? '#6D28D9' : isSelected ? '#1D4ED8' : ns.stroke}
                  strokeWidth={(isSelected ? 2.5 : 2) / scale}
                  shadowColor={isSelected ? '#2563EB' : undefined}
                  shadowBlur={isSelected ? 8 : 0}
                />

                {/* Node type letter label */}
                {node.type !== 'junction' && (
                  <Text
                    x={-4.5 / scale}
                    y={-4 / scale}
                    text={ns.label}
                    fontSize={8.5 / scale}
                    fill={ns.stroke}
                    fontStyle="bold"
                    listening={false}
                  />
                )}

                {/* QR Indicator Badge */}
                {hasQr && (
                  <Text
                    x={-7 / scale}
                    y={-18 / scale}
                    text="QR"
                    fontSize={9.5 / scale}
                    fill="#7C3AED"
                    fontStyle="bold"
                    listening={false}
                  />
                )}
              </Group>
            );
          })}
        </Layer>

        {/* 5. SMART ALIGNMENT GUIDES LAYER */}
        <Layer listening={false}>
          {activeGuides.map((guide, idx) => {
            const stageX = position.x;
            const stageY = position.y;
            const viewW = dimensions.width / scale;
            const viewH = dimensions.height / scale;

            if (guide.orientation === 'v') {
              // Vertical Guide Line
              return (
                <Line
                  key={`guide-v-${idx}`}
                  points={[
                    guide.pos,
                    -stageY / scale,
                    guide.pos,
                    -stageY / scale + viewH,
                  ]}
                  stroke={THEME.guideLine}
                  strokeWidth={1.2 / scale}
                  dash={[4 / scale, 4 / scale]}
                />
              );
            } else {
              // Horizontal Guide Line
              return (
                <Line
                  key={`guide-h-${idx}`}
                  points={[
                    -stageX / scale,
                    guide.pos,
                    -stageX / scale + viewW,
                    guide.pos,
                  ]}
                  stroke={THEME.guideLine}
                  strokeWidth={1.2 / scale}
                  dash={[4 / scale, 4 / scale]}
                />
              );
            }
          })}
        </Layer>
      </Stage>

      {/* Floating Bottom Viewport Controls */}
      <div className="absolute bottom-5 right-5 flex items-center gap-1.5 bg-[#0d0d14]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-2xl z-20 select-none">
        {/* Zoom Out */}
        <button
          onClick={() => zoomAtPointer(scale / 1.2)}
          className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          title="Zoom Out (-)"
        >
          <ZoomOut size={16} />
        </button>

        {/* Zoom Percentage */}
        <span className="text-xs font-semibold px-2 text-gray-300 min-w-[52px] text-center font-mono">
          {Math.round(scale * 100)}%
        </span>

        {/* Zoom In */}
        <button
          onClick={() => zoomAtPointer(scale * 1.2)}
          className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          title="Zoom In (+)"
        >
          <ZoomIn size={16} />
        </button>

        <div className="w-px h-5 bg-white/10 mx-0.5" />

        {/* Reset / 100% */}
        <button
          onClick={() => {
            setScale(1);
            setPosition({ x: 0, y: 0 });
          }}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          title="Reset View (100%)"
        >
          <RotateCcw size={15} />
        </button>

        {/* Fit to Screen */}
        <button
          onClick={handleFitToScreen}
          className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-xs font-medium"
          title="Fit Map to Screen"
        >
          <Maximize2 size={15} />
          <span className="hidden sm:inline">Fit</span>
        </button>
      </div>

      {/* Helper Bar */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-gray-300 text-xs px-4 py-2 rounded-full border border-white/10 pointer-events-none z-10 flex items-center gap-3">
        <span>
          <strong className="text-white">Space+Drag</strong> or <strong className="text-white">Middle-Click</strong> to Pan
        </span>
        <span>•</span>
        <span>
          <strong className="text-white">Scroll</strong> to Zoom
        </span>
        <span>•</span>
        <span>
          <strong className="text-white">Click</strong> to Inspect / Move
        </span>
        <span>•</span>
        <span>
          <strong className="text-white">Del</strong> to Remove
        </span>
      </div>
    </div>
  );
}
