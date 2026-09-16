/**
 * Graph Validation Engine
 * Checks for:
 * 1. Unconnected / unreachable rooms (rooms without doors or nodes connected to the corridor graph)
 * 2. Disconnected graph components (subgraphs of corridor nodes/edges with no path to each other)
 * 3. Isolated nodes (corridor nodes with degree 0)
 */

/**
 * Point-in-polygon check using ray casting
 */
function isPointInPolygon(px, py, pts) {
  if (!pts || pts.length < 6) return false;
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2];
    const yi = pts[i * 2 + 1];
    const xj = pts[j * 2];
    const yj = pts[j * 2 + 1];

    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Minimum distance from point to line segment
 */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Validates the indoor navigation graph
 * @param {Object} mapState { rooms, nodes, edges, walls, doors, pixelsPerMeter }
 * @returns {Object} { isValid, warnings, unconnectedRooms, isolatedNodes, componentCount }
 */
export function validateGraph({
  rooms = [],
  nodes = [],
  edges = [],
  walls = [],
  doors = [],
  pixelsPerMeter = 1,
}) {
  const warnings = [];
  const ppm = pixelsPerMeter > 1 ? pixelsPerMeter : 1;
  const reachDistanceThreshold = Math.max(35, ppm * 1.2); // ~1.2m or 35px

  // 1. Build adjacency list of corridor nodes with edges
  const adjList = new Map();
  nodes.forEach((n) => adjList.set(n.id, []));
  edges.forEach((e) => {
    if (adjList.has(e.from_node) && adjList.has(e.to_node)) {
      adjList.get(e.from_node).push(e.to_node);
      adjList.get(e.to_node).push(e.from_node);
    }
  });

  // Calculate degree of each node
  const nodeDegrees = new Map();
  nodes.forEach((n) => {
    nodeDegrees.set(n.id, (adjList.get(n.id) || []).length);
  });

  // Find connected components using Breadth-First Search (BFS)
  const visited = new Set();
  const components = [];

  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      const comp = [];
      const queue = [node.id];
      visited.add(node.id);

      while (queue.length > 0) {
        const curr = queue.shift();
        comp.push(curr);
        const neighbors = adjList.get(curr) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      components.push(comp);
    }
  });

  // Flag isolated nodes (degree 0)
  const isolatedNodes = nodes.filter((n) => (nodeDegrees.get(n.id) || 0) === 0);
  if (isolatedNodes.length > 0) {
    warnings.push({
      id: 'isolated-nodes',
      type: 'warning',
      category: 'node',
      title: `${isolatedNodes.length} Isolated Node${isolatedNodes.length > 1 ? 's' : ''}`,
      message: `${isolatedNodes.length} node${isolatedNodes.length > 1 ? 's are' : ' is'} not connected to any path edges.`,
      elementIds: isolatedNodes.map((n) => n.id),
    });
  }

  // Flag disconnected network components (ignoring single isolated nodes)
  const networkComponents = components.filter((comp) => comp.length > 1);
  if (networkComponents.length > 1) {
    warnings.push({
      id: 'split-graph',
      type: 'error',
      category: 'graph',
      title: 'Disconnected Path Networks',
      message: `The corridor graph is split into ${networkComponents.length} disconnected subnetworks with no path between them.`,
      componentCount: networkComponents.length,
    });
  }

  // 2. Validate Room Connectivity
  // Compute coordinates for each placed door
  const doorPositions = doors.map((d) => {
    const wall = walls.find((w) => w.id === d.wall_id);
    if (!wall) return null;
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    return {
      doorId: d.id,
      wallId: wall.id,
      x: wall.x1 + (d.position_along_wall || 0.5) * dx,
      y: wall.y1 + (d.position_along_wall || 0.5) * dy,
    };
  }).filter(Boolean);

  const unconnectedRooms = [];

  rooms.forEach((room) => {
    if (!room.shape_data || room.shape_data.length < 6) return;

    // Check if room has any connected door or corridor node
    let isConnected = false;

    // A. Check if any door is along the room perimeter or nearby
    for (const dp of doorPositions) {
      // Is door close to any segment of this room's polygon?
      for (let i = 0; i < room.shape_data.length; i += 2) {
        const x1 = room.shape_data[i];
        const y1 = room.shape_data[i + 1];
        const nextIdx = (i + 2) % room.shape_data.length;
        const x2 = room.shape_data[nextIdx];
        const y2 = room.shape_data[nextIdx + 1];

        const dist = distToSegment(dp.x, dp.y, x1, y1, x2, y2);
        if (dist <= reachDistanceThreshold) {
          // Door is on/near this room! Now check if there is a connected node near this door
          const hasLinkedNode = nodes.some((n) => {
            if ((nodeDegrees.get(n.id) || 0) === 0) return false; // node must have edges
            return Math.hypot(n.x - dp.x, n.y - dp.y) <= reachDistanceThreshold * 1.5;
          });
          if (hasLinkedNode) {
            isConnected = true;
            break;
          }
        }
      }
      if (isConnected) break;
    }

    // B. Check if any connected node is inside or adjacent to the room
    if (!isConnected) {
      for (const node of nodes) {
        if ((nodeDegrees.get(node.id) || 0) === 0) continue; // must have edges to be reachable
        // Is node inside room?
        if (isPointInPolygon(node.x, node.y, room.shape_data)) {
          isConnected = true;
          break;
        }
        // Is node adjacent to room boundary?
        for (let i = 0; i < room.shape_data.length; i += 2) {
          const x1 = room.shape_data[i];
          const y1 = room.shape_data[i + 1];
          const nextIdx = (i + 2) % room.shape_data.length;
          const x2 = room.shape_data[nextIdx];
          const y2 = room.shape_data[nextIdx + 1];

          if (distToSegment(node.x, node.y, x1, y1, x2, y2) <= reachDistanceThreshold) {
            isConnected = true;
            break;
          }
        }
        if (isConnected) break;
      }
    }

    if (!isConnected) {
      unconnectedRooms.push(room);
    }
  });

  if (unconnectedRooms.length > 0) {
    unconnectedRooms.forEach((r) => {
      warnings.push({
        id: `unconnected-room-${r.id}`,
        type: 'warning',
        category: 'room',
        elementId: r.id,
        elementType: 'room',
        title: `Unreachable: ${r.name || 'Room'}`,
        message: `Room "${r.name || 'Unnamed'}" has no door or connected corridor node linking it to the navigation graph.`,
      });
    });
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    unconnectedRooms,
    isolatedNodes,
    componentCount: networkComponents.length,
  };
}
