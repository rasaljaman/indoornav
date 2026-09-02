import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Group, Text } from 'react-konva';

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
  blueprintUrl, 
  rooms, 
  nodes, 
  edges,
  qrPoints = [],
  onRoomsChange,
  onNodesChange,
  onEdgesChange,
  onScaleCalibrated,
  onNodeQrClick
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
    img.onload = () => setImage(img);
  }, [blueprintUrl]);

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
    // If we're dragging or panning, ignore
    if (e.evt.button === 1 || e.evt.button === 2) return;
    
    // If clicking on a shape, e.target is the shape. For stage click, we just want empty areas for rooms/nodes
    // Actually, react-konva bubbles events. We'll handle node clicks separately.
    
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
        type: 'junction'
      };
      onNodesChange([...nodes, newNode]);
    } else if (currentTool === 'scale') {
      const newPts = [...currentScalePts, x, y];
      if (newPts.length === 4) {
        onScaleCalibrated(newPts);
        setCurrentScalePts([]); // Reset
      } else {
        setCurrentScalePts(newPts);
      }
    }
  };

  // Close Room Polygon on Double Click
  const handleStageDblClick = (e) => {
    if (currentTool === 'room' && currentRoomPts.length >= 6) {
      // Need at least 3 points (6 coordinates) to make a polygon
      const newRoom = {
        id: crypto.randomUUID(),
        name: 'New Room',
        category: 'other',
        shape_data: currentRoomPts
      };
      onRoomsChange([...rooms, newRoom]);
      setCurrentRoomPts([]);
    }
  };

  const handleNodeClick = (e, node) => {
    e.cancelBubble = true; // prevent stage click
    if (currentTool === 'edge') {
      if (!selectedNodeId) {
        setSelectedNodeId(node.id);
      } else {
        if (selectedNodeId !== node.id) {
          // Create edge
          const newEdge = {
            id: crypto.randomUUID(),
            from_node: selectedNodeId,
            to_node: node.id,
            weight: 0 // Will be calculated on save based on scale
          };
          onEdgesChange([...edges, newEdge]);
        }
        setSelectedNodeId(null);
      }
    } else if (currentTool === 'qr') {
      if (onNodeQrClick) {
        onNodeQrClick(node.id);
      }
    }
  };

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
          {/* Render Saved Rooms */}
          {rooms.map((room) => {
            const style = THEME.rooms[room.category] || THEME.rooms.other;
            return (
              <Group key={room.id}>
                <Line
                  points={room.shape_data}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={2 / scale}
                  closed
                  opacity={0.9}
                />
                {/* Find center to draw label roughly */}
                {room.shape_data.length >= 6 && (
                  <Text 
                    x={room.shape_data[0]} 
                    y={room.shape_data[1]} 
                    text={room.name}
                    fontSize={14 / scale}
                    fill="#3C4043"
                    align="center"
                    fontFamily="Inter, sans-serif"
                    fontStyle="bold"
                  />
                )}
              </Group>
            );
          })}

          {/* Render Room Currently Being Drawn */}
          {currentRoomPts.length > 0 && (
            <Line
              points={currentRoomPts}
              stroke="#3B82F6"
              strokeWidth={3 / scale}
              dash={[10 / scale, 5 / scale]}
              closed={false}
            />
          )}

          {/* Render Scale Line Currently Being Drawn */}
          {currentScalePts.length > 0 && (
            <Line
              points={currentScalePts}
              stroke="#EF4444" // Red for calibration
              strokeWidth={4 / scale}
              dash={[5 / scale, 5 / scale]}
              closed={false}
            />
          )}
        </Layer>

        {/* GRAPH LAYER (Paths and Nodes) */}
        <Layer>
          {/* Edges (Google Maps style paths) */}
          {edges.map((edge) => {
            const n1 = nodes.find(n => n.id === edge.from_node);
            const n2 = nodes.find(n => n.id === edge.to_node);
            if (!n1 || !n2) return null;
            return (
              <Group key={edge.id}>
                {/* Path Outline */}
                <Line 
                  points={[n1.x, n1.y, n2.x, n2.y]}
                  stroke={THEME.path.outline}
                  strokeWidth={THEME.path.outlineWidth / scale}
                  lineCap="round"
                  lineJoin="round"
                />
                {/* Path Inner */}
                <Line 
                  points={[n1.x, n1.y, n2.x, n2.y]}
                  stroke={THEME.path.color}
                  strokeWidth={THEME.path.width / scale}
                  lineCap="round"
                  lineJoin="round"
                />
              </Group>
            );
          })}

          {/* Render Active Edge Line */}
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
            />
          )}

          {/* Nodes */}
          {nodes.map((node) => {
            const hasQr = qrPoints.some(q => q.node_id === node.id);
            return (
              <Group key={node.id}>
                <Circle
                  x={node.x}
                  y={node.y}
                  radius={(selectedNodeId === node.id ? 8 : 5) / scale}
                  fill={selectedNodeId === node.id ? THEME.path.color : (hasQr ? "#8B5CF6" : "#FFFFFF")}
                  stroke={hasQr ? "#6D28D9" : "#1A73E8"}
                  strokeWidth={2 / scale}
                  onClick={(e) => handleNodeClick(e, node)}
                  onTap={(e) => handleNodeClick(e, node)}
                  onMouseEnter={(e) => {
                    if (currentTool === 'edge' || currentTool === 'qr') {
                      const container = e.target.getStage().container();
                      container.style.cursor = 'pointer';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentTool === 'edge' || currentTool === 'qr') {
                      const container = e.target.getStage().container();
                      container.style.cursor = 'crosshair';
                    }
                  }}
                />
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
    </div>
  );
}
