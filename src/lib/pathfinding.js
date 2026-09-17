/**
 * Calculates Euclidean distance between two nodes in real-world meters
 */
function heuristic(nodeA, nodeB, pixelsPerMeter = 1) {
  if (!nodeA || !nodeB) return 0;
  // If nodes are on different floors, return 0 for strict A* admissibility
  if (nodeA.floor_id && nodeB.floor_id && nodeA.floor_id !== nodeB.floor_id) {
    return 0;
  }
  const dx = nodeA.x - nodeB.x;
  const dy = nodeA.y - nodeB.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  const ppm = pixelsPerMeter > 1 ? pixelsPerMeter : 1;
  return pixelDist / ppm;
}

/**
 * Computes the real-world distance between two nodes in meters
 */
export function computeEdgeDistance(nodeA, nodeB, pixelsPerMeter = 1) {
  if (!nodeA || !nodeB) return 0;
  const dx = nodeA.x - nodeB.x;
  const dy = nodeA.y - nodeB.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  const ppm = pixelsPerMeter > 1 ? pixelsPerMeter : 1;
  return Math.round((pixelDist / ppm) * 100) / 100;
}

/**
 * Finds the shortest path using A* (supports single-floor and multi-floor graphs)
 * @param {string} startId - The ID of the starting node
 * @param {string} endId - The ID of the destination node
 * @param {Array} nodes - Array of node objects: {id, x, y, floor_id, ...}
 * @param {Array} edges - Array of edge objects: {from_node, to_node, weight}
 * @param {number|Object} pixelsPerMeter - Scale calibration factor (number or floor_id map)
 * @param {Array} floorConnectors - Optional array of floor connectors: {node_a, node_b, type, weight}
 * @returns {Array} Array of node IDs representing the path, or null if no path found
 */
export function findShortestPath(startId, endId, nodes, edges, pixelsPerMeter = 1, floorConnectors = []) {
  if (!startId || !endId || !nodes || !edges) return null;

  const nodesMap = new Map(nodes.map(n => [n.id, n]));
  const endNode = nodesMap.get(endId);
  const startNode = nodesMap.get(startId);
  
  if (!endNode || !startNode) return null;

  const getPpm = (floorId) => {
    if (typeof pixelsPerMeter === 'object' && pixelsPerMeter !== null) {
      return pixelsPerMeter[floorId] > 1 ? pixelsPerMeter[floorId] : 1;
    }
    return pixelsPerMeter > 1 ? pixelsPerMeter : 1;
  };

  // 1. Build adjacency list for quick neighbor lookup
  const adjList = {};
  nodes.forEach(n => adjList[n.id] = []);
  
  // Normal edges
  edges.forEach(e => {
    let w = parseFloat(e.weight);
    if (!w || w <= 0) {
      const n1 = nodesMap.get(e.from_node);
      const n2 = nodesMap.get(e.to_node);
      if (n1 && n2) {
        const ppm = getPpm(n1.floor_id);
        w = computeEdgeDistance(n1, n2, ppm);
      } else {
        w = 1;
      }
    }

    if (adjList[e.from_node] && adjList[e.to_node]) {
      adjList[e.from_node].push({ target: e.to_node, weight: w, is_connector: false });
      adjList[e.to_node].push({ target: e.from_node, weight: w, is_connector: false });
    }
  });

  // Cross-floor connector edges
  if (Array.isArray(floorConnectors)) {
    floorConnectors.forEach(fc => {
      const w = parseFloat(fc.weight) > 0 ? parseFloat(fc.weight) : 30;
      if (adjList[fc.node_a] && adjList[fc.node_b]) {
        adjList[fc.node_a].push({ target: fc.node_b, weight: w, is_connector: true, connector_type: fc.type });
        adjList[fc.node_b].push({ target: fc.node_a, weight: w, is_connector: true, connector_type: fc.type });
      }
    });
  }

  // A* Initialization
  const openSet = new Set([startId]);
  const closedSet = new Set();
  
  const cameFrom = {};
  
  const gScore = {};
  nodes.forEach(n => gScore[n.id] = Infinity);
  gScore[startId] = 0;
  
  const fScore = {};
  nodes.forEach(n => fScore[n.id] = Infinity);
  fScore[startId] = heuristic(startNode, endNode, getPpm(startNode.floor_id));

  while (openSet.size > 0) {
    let currentId = null;
    let lowestF = Infinity;
    for (const id of openSet) {
      if (fScore[id] < lowestF) {
        lowestF = fScore[id];
        currentId = id;
      }
    }

    if (currentId === endId) {
      // Reconstruct path
      const path = [currentId];
      let curr = currentId;
      while (cameFrom[curr]) {
        curr = cameFrom[curr];
        path.unshift(curr);
      }
      return path;
    }

    openSet.delete(currentId);
    closedSet.add(currentId);

    const neighbors = adjList[currentId] || [];
    for (const neighbor of neighbors) {
      if (closedSet.has(neighbor.target)) continue;

      const tentativeGScore = gScore[currentId] + neighbor.weight;

      if (!openSet.has(neighbor.target)) {
        openSet.add(neighbor.target);
      } else if (tentativeGScore >= gScore[neighbor.target]) {
        continue;
      }

      const neighborNode = nodesMap.get(neighbor.target);
      cameFrom[neighbor.target] = currentId;
      gScore[neighbor.target] = tentativeGScore;
      fScore[neighbor.target] = gScore[neighbor.target] + heuristic(neighborNode, endNode, getPpm(neighborNode?.floor_id));
    }
  }

  return null;
}

/**
 * Enhanced Multi-Floor Pathfinding: Returns detailed path, floor segments, steps, and transitions
 */
export function findMultiFloorPath({
  startId,
  endId,
  nodes = [],
  edges = [],
  floorConnectors = [],
  floors = [],
  pixelsPerMeter = 1
}) {
  const path = findShortestPath(startId, endId, nodes, edges, pixelsPerMeter, floorConnectors);
  if (!path || path.length === 0) return null;

  const nodesMap = new Map(nodes.map(n => [n.id, n]));
  const floorsMap = new Map(floors.map(f => [f.id, f]));
  const pathNodes = path.map(id => nodesMap.get(id)).filter(Boolean);

  // Group into floor segments and detect connector transitions
  const floorSegments = [];
  const connectorsUsed = [];
  const steps = [];

  let currentSegment = null;
  let prevNode = null;

  pathNodes.forEach((node, idx) => {
    const floorInfo = floorsMap.get(node.floor_id) || { name: `Floor ${node.floor_id?.slice(0, 4)}` };

    if (!currentSegment || currentSegment.floorId !== node.floor_id) {
      if (prevNode && prevNode.floor_id !== node.floor_id) {
        // Detected a cross-floor transition!
        const prevFloor = floorsMap.get(prevNode.floor_id) || { name: 'Floor' };
        const connector = (floorConnectors || []).find(
          c => (c.node_a === prevNode.id && c.node_b === node.id) ||
               (c.node_b === prevNode.id && c.node_a === node.id)
        );
        const connType = connector?.type || prevNode.type || 'stairs';
        
        connectorsUsed.push({
          type: connType,
          fromNodeId: prevNode.id,
          toNodeId: node.id,
          fromFloorName: prevFloor.name,
          toFloorName: floorInfo.name,
          fromFloorId: prevNode.floor_id,
          toFloorId: node.floor_id
        });

        steps.push({
          type: 'transition',
          action: `Take ${connType} from ${prevFloor.name} to ${floorInfo.name}`,
          fromFloorId: prevNode.floor_id,
          toFloorId: node.floor_id,
          nodeId: node.id
        });
      }

      currentSegment = {
        floorId: node.floor_id,
        floorName: floorInfo.name,
        nodeIds: [],
        nodes: []
      };
      floorSegments.push(currentSegment);
    }

    currentSegment.nodeIds.push(node.id);
    currentSegment.nodes.push(node);

    // Regular navigation step
    if (idx === 0) {
      steps.push({
        type: 'start',
        action: `Start at ${node.label || node.type || 'starting location'} (${floorInfo.name})`,
        floorId: node.floor_id,
        nodeId: node.id
      });
    } else if (idx === pathNodes.length - 1) {
      steps.push({
        type: 'destination',
        action: `Arrive at destination (${floorInfo.name})`,
        floorId: node.floor_id,
        nodeId: node.id
      });
    } else if (node.type === 'stairs' || node.type === 'elevator' || node.type === 'ramp') {
      steps.push({
        type: 'connector_node',
        action: `Reach ${node.type} access point (${floorInfo.name})`,
        floorId: node.floor_id,
        nodeId: node.id
      });
    }

    prevNode = node;
  });

  return {
    path,
    pathNodes,
    totalNodes: path.length,
    crossesFloors: floorSegments.length > 1,
    connectorsUsed,
    floorSegments,
    steps
  };
}

/**
 * Helper: Computes the 2D center point of any room polygon (handles flat arrays or point pairs)
 */
export function getRoomCenter(room) {
  if (!room || !room.shape_data || room.shape_data.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  if (typeof room.shape_data[0] === 'number') {
    for (let i = 0; i < room.shape_data.length; i += 2) {
      sumX += room.shape_data[i];
      sumY += room.shape_data[i + 1];
      count++;
    }
  } else if (Array.isArray(room.shape_data[0])) {
    room.shape_data.forEach(pt => {
      sumX += pt[0];
      sumY += pt[1];
      count++;
    });
  }

  if (count === 0) return null;
  return { x: sumX / count, y: sumY / count };
}

/**
 * Helper: Find the closest node to a given room's center
 */
export function findClosestNodeToRoom(room, nodes) {
  const center = getRoomCenter(room);
  if (!center || !nodes || nodes.length === 0) return null;

  let closest = null;
  let minDistance = Infinity;

  nodes.forEach(node => {
    const dx = node.x - center.x;
    const dy = node.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDistance) {
      minDistance = dist;
      closest = node;
    }
  });

  return closest;
}
