import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Group, Text, Wedge } from 'react-konva';

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
  },
  route: {
    color: '#3B82F6', // Blue route
    width: 8,
    glow: '#60A5FA',
    glowWidth: 16
  }
};

export default function VisitorMap({
  blueprintUrl,
  rooms = [],
  nodes = [],
  _edges = [],
  currentLocationNodeId = null,
  liveLocation = null, // { x, y, heading }
  path = [],
}) {
  const stageRef = useRef(null);
  const [image, setImage] = useState(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight - 300 });

  // Viewport State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);

  // Smooth Live Position State & Ref
  const [displayPos, setDisplayPos] = useState(null);
  const displayPosRef = useRef(null);
  const animFrameRef = useRef(null);

  // Radar Pulse State
  const [pulseRadius, setPulseRadius] = useState(12);

  // Resize listener
  useEffect(() => {
    function handleResize() {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - 250
      });
    }
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load Blueprint Image
  useEffect(() => {
    if (!blueprintUrl) return;
    const img = new window.Image();
    img.src = blueprintUrl;
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
  }, [blueprintUrl]);

  // Smooth interpolation for live position & heading
  useEffect(() => {
    let target = null;
    if (liveLocation && typeof liveLocation.x === 'number' && typeof liveLocation.y === 'number') {
      target = {
        x: liveLocation.x,
        y: liveLocation.y,
        heading: liveLocation.heading ?? 0
      };
    } else if (currentLocationNodeId) {
      const node = nodes.find(n => n.id === currentLocationNodeId);
      if (node) {
        target = {
          x: node.x,
          y: node.y,
          heading: 0
        };
      }
    }

    if (!target) return;

    // Instant snap for the very first reading
    if (!displayPosRef.current) {
      displayPosRef.current = target;
      setDisplayPos(target);
      return;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    const animate = () => {
      const cur = displayPosRef.current;
      if (!cur) return;

      const dx = target.x - cur.x;
      const dy = target.y - cur.y;
      const dist = Math.hypot(dx, dy);

      // Shortest path circular angle difference for heading
      const diffHeading = ((target.heading - cur.heading + 540) % 360) - 180;

      if (dist < 0.2 && Math.abs(diffHeading) < 0.3) {
        displayPosRef.current = target;
        setDisplayPos(target);
        return;
      }

      // Smooth lerp factor (~15% per frame at 60fps)
      const nextPos = {
        x: cur.x + dx * 0.15,
        y: cur.y + dy * 0.15,
        heading: (cur.heading + diffHeading * 0.15 + 360) % 360
      };

      displayPosRef.current = nextPos;
      setDisplayPos(nextPos);
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [liveLocation?.x, liveLocation?.y, liveLocation?.heading, currentLocationNodeId, nodes]);

  // Radar Pulse Loop
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseRadius(r => (r >= 22 ? 12 : r + 1.5));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Center map initially
  useEffect(() => {
    if (nodes.length === 0 || !stageRef.current) return;

    let targetNode = null;
    if (path.length > 0) {
      targetNode = nodes.find(n => n.id === path[0]);
    } else if (displayPos) {
      targetNode = displayPos;
    } else if (currentLocationNodeId) {
      targetNode = nodes.find(n => n.id === currentLocationNodeId);
    } else if (image) {
      targetNode = { x: image.width / 2, y: image.height / 2 };
    }

    if (targetNode) {
      const defaultScale = 1.5;
      const targetX = (dimensions.width / 2) - (targetNode.x * defaultScale);
      const targetY = (dimensions.height / 2) - (targetNode.y * defaultScale);

      setScale(defaultScale);
      setPosition({ x: targetX, y: targetY });
    }
  }, [nodes.length, path.length === 0, currentLocationNodeId]);

  // Recenter helper
  const handleRecenter = useCallback(() => {
    const target = displayPos || (currentLocationNodeId ? nodes.find(n => n.id === currentLocationNodeId) : null);
    if (!target || !stageRef.current) return;

    const targetX = (dimensions.width / 2) - (target.x * scale);
    const targetY = (dimensions.height / 2) - (target.y * scale);
    setPosition({ x: targetX, y: targetY });
  }, [displayPos, currentLocationNodeId, nodes, dimensions, scale]);

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

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const clampedScale = Math.max(0.2, Math.min(newScale, 5));

    setScale(clampedScale);
    setPosition({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  }, []);

  // Dynamic Route Line Points (shortening behind the visitor as they walk)
  const routePoints = useMemo(() => {
    if (!path || path.length === 0) return [];
    const nodesMap = new Map(nodes.map(n => [n.id, n]));

    // If no live position, render the standard path
    if (!displayPos) {
      const pts = [];
      path.forEach(nodeId => {
        const node = nodesMap.get(nodeId);
        if (node) pts.push(node.x, node.y);
      });
      return pts;
    }

    if (path.length === 1) {
      const target = nodesMap.get(path[0]);
      return target ? [displayPos.x, displayPos.y, target.x, target.y] : [];
    }

    // Find the closest path segment to displayPos
    let bestSegIndex = 0;
    let minSegDist = Infinity;

    for (let i = 0; i < path.length - 1; i++) {
      const a = nodesMap.get(path[i]);
      const b = nodesMap.get(path[i + 1]);
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      let t = 0;
      if (lenSq > 0) {
        t = Math.max(0, Math.min(1, ((displayPos.x - a.x) * dx + (displayPos.y - a.y) * dy) / lenSq));
      }
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      const dist = Math.hypot(displayPos.x - projX, displayPos.y - projY);

      if (dist < minSegDist) {
        minSegDist = dist;
        bestSegIndex = i;
      }
    }

    // Polyline begins directly from the visitor's live location
    // and continues along the remaining destination nodes
    const pts = [displayPos.x, displayPos.y];
    for (let j = bestSegIndex + 1; j < path.length; j++) {
      const node = nodesMap.get(path[j]);
      if (node) {
        pts.push(node.x, node.y);
      }
    }

    return pts;
  }, [path, nodes, displayPos]);

  // Route pulse glow animation
  useEffect(() => {
    if (path.length > 0) {
      const interval = setInterval(() => {
        setIsAnimating(a => !a);
      }, 800);
      return () => clearInterval(interval);
    }
  }, [path]);

  // Directional wedge start angle in Konva degrees
  // Konva 0° is +X (East). Our heading 0° is North (-90° Konva).
  // A 60° beam centered on heading starts at (heading - 90 - 30) = (heading - 120)
  const wedgeRotation = displayPos ? (displayPos.heading - 120) : 0;

  return (
    <div className="w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative" style={{ height: dimensions.height, background: THEME.background }}>
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        onWheel={handleWheel}
        draggable
        onDragEnd={(e) => {
          setPosition({ x: e.target.x(), y: e.target.y() });
        }}
      >
        <Layer>
          {/* Blueprint Image */}
          {image && (
            <KonvaImage
              image={image}
              opacity={0.8}
            />
          )}

          {/* Rooms */}
          {rooms.map((room) => {
            const style = THEME.rooms[room.category] || THEME.rooms.other;
            const pts = room.shape_data ? room.shape_data.flat() : [];
            
            // Calculate label position
            let centerX = 0, centerY = 0;
            if (room.shape_data && room.shape_data.length > 0) {
              const sum = room.shape_data.reduce((acc, pt) => [acc[0] + pt[0], acc[1] + pt[1]], [0, 0]);
              centerX = sum[0] / room.shape_data.length;
              centerY = sum[1] / room.shape_data.length;
            }

            return (
              <Group key={room.id}>
                <Line
                  points={pts}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={2 / scale}
                  closed
                  opacity={0.85}
                  tension={0}
                />
                {room.name && (
                  <Text
                    x={centerX - (room.name.length * (3 / scale))}
                    y={centerY - (6 / scale)}
                    text={room.name}
                    fontSize={12 / scale}
                    fill="#3c4043"
                    fontFamily="Inter, sans-serif"
                    fontStyle="500"
                    align="center"
                    listening={false}
                  />
                )}
              </Group>
            );
          })}

          {/* Active Route Overlay (Shortening behind the user) */}
          {routePoints.length > 2 && (
            <Group>
              <Line
                points={routePoints}
                stroke={isAnimating ? THEME.route.glow : THEME.route.color}
                strokeWidth={(isAnimating ? THEME.route.glowWidth : THEME.route.width) / scale}
                lineCap="round"
                lineJoin="round"
                opacity={0.85}
                tension={0}
              />
              <Line
                points={routePoints}
                stroke="#FFFFFF"
                strokeWidth={3 / scale}
                lineCap="round"
                lineJoin="round"
                tension={0}
              />
            </Group>
          )}

          {/* Destination Marker */}
          {path.length > 0 && (
            nodes.map(node => {
              if (node.id === path[path.length - 1]) {
                return (
                  <Group key="dest-loc">
                    <Circle
                      x={node.x}
                      y={node.y - (10 / scale)}
                      radius={6 / scale}
                      fill="#EF4444"
                      stroke="#FFFFFF"
                      strokeWidth={2 / scale}
                      listening={false}
                    />
                    <Text
                      x={node.x - (15 / scale)}
                      y={node.y + (5 / scale)}
                      text="Destination"
                      fontSize={10 / scale}
                      fill="#EF4444"
                      fontStyle="bold"
                      listening={false}
                    />
                  </Group>
                );
              }
              return null;
            })
          )}

          {/* Live Mobile Tracking Marker */}
          {displayPos && (
            <Group key="live-tracking-marker">
              {/* Directional Flashlight / Heading Beam */}
              <Wedge
                x={displayPos.x}
                y={displayPos.y}
                radius={42 / scale}
                angle={60}
                rotation={wedgeRotation}
                fill="rgba(59, 130, 246, 0.22)"
                listening={false}
              />

              {/* Pulsing Radar Signal Ring */}
              <Circle
                x={displayPos.x}
                y={displayPos.y}
                radius={pulseRadius / scale}
                fill="rgba(59, 130, 246, 0.2)"
                stroke="rgba(59, 130, 246, 0.4)"
                strokeWidth={1 / scale}
                listening={false}
              />

              {/* White Outline Ring */}
              <Circle
                x={displayPos.x}
                y={displayPos.y}
                radius={7 / scale}
                fill="#FFFFFF"
                shadowColor="rgba(0, 0, 0, 0.35)"
                shadowBlur={4}
                listening={false}
              />

              {/* Vibrant Blue Location Dot */}
              <Circle
                x={displayPos.x}
                y={displayPos.y}
                radius={5 / scale}
                fill="#2563EB"
                listening={false}
              />

              {/* "You" Indicator Badge */}
              <Text
                x={displayPos.x - (14 / scale)}
                y={displayPos.y + (10 / scale)}
                text="You"
                fontSize={10 / scale}
                fill="#1D4ED8"
                fontStyle="bold"
                listening={false}
              />
            </Group>
          )}

        </Layer>
      </Stage>
      
      {/* Overlay UI Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
        <button 
          onClick={handleRecenter}
          title="Recenter Map"
          className="bg-white text-blue-600 w-10 h-10 rounded-xl shadow-lg flex items-center justify-center font-bold text-lg hover:bg-gray-50 active:scale-95 transition-transform"
        >
          📍
        </button>
        <button 
          onClick={() => setScale(s => Math.min(s * 1.4, 5))}
          title="Zoom In"
          className="bg-white text-gray-800 w-10 h-10 rounded-xl shadow-lg font-bold text-xl hover:bg-gray-50 active:scale-95 transition-transform"
        >+</button>
        <button 
          onClick={() => setScale(s => Math.max(s / 1.4, 0.2))}
          title="Zoom Out"
          className="bg-white text-gray-800 w-10 h-10 rounded-xl shadow-lg font-bold text-xl hover:bg-gray-50 active:scale-95 transition-transform"
        >-</button>
      </div>
    </div>
  );
}
