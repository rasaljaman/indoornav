import { Stage, Layer, Image as KonvaImage, Line, Circle, Group, Text } from 'react-konva';

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
    outlineWidth: 10
  }
};

export default function CanvasManager({
  currentTool,
  nodeType = 'junction',
  blueprintUrl,
  rooms,
  nodes,
  edges,
  qrPoints = [],
  selectedRoomId,
  onRoomsChange,
  onNodesChange,
  onEdgesChange,
  onScaleCalibrated,
  onNodeQrClick,
  onRoomSelect,
  onDeleteRoom,
  onDeleteNode,
  onDeleteEdge,
}) {
  const stageRef = useRef(null);
  const [image, setImage] = useState(null);

  // Viewport State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Drawing State
  const [currentRoomPts, setCurrentRoomPts] = useState([]);
  const [currentScalePts, setCurrentScalePts] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Load Blueprint Image
  useEffect(() => {
    if (!blueprintUrl) return;
    const img = new window.Image();
    img.src = blueprintUrl;
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
  }, [blueprintUrl]);

  // Keyboard handler for Delete
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (selectedRoomId && onDeleteRoom) {
          onDeleteRoom(selectedRoomId);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRoomId, onDeleteRoom]);

  // Handle Zoom
  const handleWheel = useCallback((e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const scaleBy = 1.1;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }, []);

  const handleMouseMove = (e) => {
    if (currentTool === 'edge' && selectedNodeId) {
      const stage = e.target.getStage();
      const pointerPosition = stage.getPointerPosition();
      setMousePos({
        x: (pointerPosition.x - stage.x()) / stage.scaleX(),
        y: (pointerPosition.y - stage.y()) / stage.scaleY()
      });
    }
  };

  // Handle Canvas Click based on Tool
  const handleStageClick = (e) => {
    if (e.evt.button === 1 || e.evt.button === 2) return;

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    const x = (pointerPosition.x - stage.x()) / stage.scaleX();
    const y = (pointerPosition.y - stage.y()) / stage.scaleY();

    if (currentTool === 'room') {
      setCurrentRoomPts([...currentRoomPts, x, y]);
    } else if (currentTool === 'node') {
      const newNode = {
        id: crypto.randomUUID(),
        x,
        y,
        type: nodeType,
      };
      onNodesChange([...nodes, newNode]);
    } else if (currentTool === 'scale') {
      const newPts = [...currentScalePts, x, y];
      if (newPts.length === 4) {
        onScaleCalibrated(newPts);
        setCurrentScalePts([]);
      } else {
        setCurrentScalePts(newPts);
      }
    } else if (currentTool === 'select') {
      // Clicked empty area — deselect
      if (e.target === stage || e.target.getParent() === stage) {
        if (onRoomSelect) onRoomSelect(null);
      }
    }
  };

  // Close Room Polygon on Double Click
  const handleStageDblClick = (e) => {
    if (currentTool === 'room' && currentRoomPts.length >= 6) {
      const newRoom = {
        id: crypto.randomUUID(),
        name: 'New Room',
        category: 'other',
        shape_data: currentRoomPts
      };
      onRoomsChange([...rooms, newRoom]);
      setCurrentRoomPts([]);
      // Auto-select the new room for editing
      if (onRoomSelect) onRoomSelect(newRoom.id);
    }
  };

  const handleRoomClick = (e, roomId) => {
    e.cancelBubble = true;
    if (currentTool === 'select' && onRoomSelect) {
      onRoomSelect(roomId);
    }
  };

  const handleNodeClick = (e, node) => {
    e.cancelBubble = true;
    if (currentTool === 'edge') {
      if (!selectedNodeId) {
        setSelectedNodeId(node.id);
      } else {
        if (selectedNodeId !== node.id) {
          const newEdge = {
            id: crypto.randomUUID(),
            from_node: selectedNodeId,
            to_node: node.id,
            weight: 0
          };
          onEdgesChange([...edges, newEdge]);
        }
        setSelectedNodeId(null);
      }
    } else if (currentTool === 'qr') {
      if (onNodeQrClick) {
        onNodeQrClick(node.id);
      }
    } else if (currentTool === 'select') {
      // Right-click or shift-click to delete node
      if (e.evt?.shiftKey && onDeleteNode) {
        onDeleteNode(node.id);
      }
    }
  };

  const handleEdgeClick = (e, edgeId) => {
    e.cancelBubble = true;
    if (currentTool === 'select' && e.evt?.shiftKey && onDeleteEdge) {
      onDeleteEdge(edgeId);
    }
  };

  // Helper: get polygon center for label
  function getPolygonCenter(pts) {
    let cx = 0, cy = 0;
    const count = pts.length / 2;
    for (let i = 0; i < pts.length; i += 2) {
      cx += pts[i];
      cy += pts[i + 1];
    }
    return { x: cx / count, y: cy / count };
  }

  return (
    <div className="w-full h-full bg-[#EFE9E1] overflow-hidden" style={{ cursor: currentTool === 'select' ? 'grab' : 'crosshair' }}>
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        draggable={currentTool === 'select'}
        x={position.x}
        y={position.y}
        scaleX={scale}
        scaleY={scale}
        onClick={handleStageClick}
        onDblClick={handleStageDblClick}
      >
        {/* BACKGROUND LAYER */}
        <Layer>
          {image && (
            <KonvaImage image={image} opacity={0.6} />
          )}
        </Layer>

        {/* ROOMS LAYER */}
        <Layer>
          {rooms.map((room) => {
            const style = THEME.rooms[room.category] || THEME.rooms.other;
            const isSelected = room.id === selectedRoomId;
            const center = room.shape_data?.length >= 6 ? getPolygonCenter(room.shape_data) : null;

            return (
              <Group key={room.id} onClick={(e) => handleRoomClick(e, room.id)}>
                <Line
                  points={room.shape_data}
                  fill={room.color || style.fill}
                  stroke={isSelected ? '#3B82F6' : style.stroke}
                  strokeWidth={(isSelected ? 3 : 2) / scale}
                  closed
                  opacity={0.9}
                  dash={isSelected ? [8 / scale, 4 / scale] : undefined}
                  hitStrokeWidth={10 / scale}
                />
                {center && (
                  <Text
                    x={center.x}
                    y={center.y}
                    text={room.name}
                    fontSize={13 / scale}
                    fill="#3C4043"
                    align="center"
                    offsetX={(room.name.length * 3.5) / scale}
                    offsetY={7 / scale}
                    fontFamily="Inter, sans-serif"
                    fontStyle="bold"
                    listening={false}
                  />
                )}
              </Group>
            );
          })}

          {/* Room Currently Being Drawn */}
          {currentRoomPts.length > 0 && (
            <Line
              points={currentRoomPts}
              stroke="#3B82F6"
              strokeWidth={3 / scale}
              dash={[10 / scale, 5 / scale]}
              closed={false}
            />
          )}

          {/* Scale Line Currently Being Drawn */}
          {currentScalePts.length > 0 && (
            <Line
              points={currentScalePts}
              stroke="#EF4444"
              strokeWidth={4 / scale}
              dash={[5 / scale, 5 / scale]}
              closed={false}
            />
          )}
        </Layer>

        {/* GRAPH LAYER (Paths and Nodes) */}
        <Layer>
          {/* Edges */}
          {edges.map((edge) => {
            const n1 = nodes.find(n => n.id === edge.from_node);
            const n2 = nodes.find(n => n.id === edge.to_node);
            if (!n1 || !n2) return null;
            return (
              <Group key={edge.id} onClick={(e) => handleEdgeClick(e, edge.id)}>
                <Line
                  points={[n1.x, n1.y, n2.x, n2.y]}
                  stroke={THEME.path.outline}
                  strokeWidth={THEME.path.outlineWidth / scale}
                  lineCap="round"
                  lineJoin="round"
                  hitStrokeWidth={15 / scale}
                />
                <Line
                  points={[n1.x, n1.y, n2.x, n2.y]}
                  stroke={THEME.path.color}
                  strokeWidth={THEME.path.width / scale}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              </Group>
            );
          })}

          {/* Active Edge Line */}
          {currentTool === 'edge' && selectedNodeId && (
            <Line
              points={[
                nodes.find(n => n.id === selectedNodeId)?.x || 0,
                nodes.find(n => n.id === selectedNodeId)?.y || 0,
                mousePos.x,
                mousePos.y
              ]}
              stroke={THEME.path.color}
              strokeWidth={THEME.path.width / scale}
              dash={[5 / scale, 5 / scale]}
              listening={false}
            />
          )}

          {/* Nodes */}
          {nodes.map((node) => {
            const hasQr = qrPoints.some(q => q.node_id === node.id);
            const ns = NODE_STYLES[node.type] || NODE_STYLES.junction;
            const isEdgeSelected = selectedNodeId === node.id;

            return (
              <Group key={node.id}>
                <Circle
                  x={node.x}
                  y={node.y}
                  radius={(isEdgeSelected ? 9 : 6) / scale}
                  fill={isEdgeSelected ? THEME.path.color : (hasQr ? '#8B5CF6' : ns.fill)}
                  stroke={hasQr ? '#6D28D9' : ns.stroke}
                  strokeWidth={2 / scale}
                  onClick={(e) => handleNodeClick(e, node)}
                  onTap={(e) => handleNodeClick(e, node)}
                  onMouseEnter={(e) => {
                    if (currentTool === 'edge' || currentTool === 'qr' || currentTool === 'select') {
                      e.target.getStage().container().style.cursor = 'pointer';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentTool === 'edge' || currentTool === 'qr') {
                      e.target.getStage().container().style.cursor = 'crosshair';
                    } else if (currentTool === 'select') {
                      e.target.getStage().container().style.cursor = 'grab';
                    }
                  }}
                />
                {/* Node type label */}
                {node.type !== 'junction' && (
                  <Text
                    x={node.x - (5 / scale)}
                    y={node.y - (4 / scale)}
                    text={ns.label}
                    fontSize={8 / scale}
                    fill={ns.stroke}
                    fontStyle="bold"
                    listening={false}
                  />
                )}
                {hasQr && (
                  <Text
                    x={node.x - (8 / scale)}
                    y={node.y - (20 / scale)}
                    text="QR"
                    fontSize={10 / scale}
                    fill="#8B5CF6"
                    fontStyle="bold"
                    listening={false}
                  />
                )}
              </Group>
            );
          })}
        </Layer>
      </Stage>

      {/* Shift+Click hint */}
      {currentTool === 'select' && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)',
          color: '#9ca3af',
          padding: '6px 16px',
          borderRadius: '8px',
          fontSize: '0.75rem',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          Click room to edit · Shift+Click node/edge to delete
        </div>
      )}
    </div>
  );
}
