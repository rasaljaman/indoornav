// A* Pathfinding Algorithm

/**
 * Calculates Euclidean distance between two nodes
 */
function heuristic(nodeA, nodeB) {
  const dx = nodeA.x - nodeB.x;
  const dy = nodeA.y - nodeB.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Finds the shortest path using A*
 * @param {string} startId - The ID of the starting node
 * @param {string} endId - The ID of the destination node
 * @param {Array} nodes - Array of node objects: {id, x, y, ...}
 * @param {Array} edges - Array of edge objects: {from_node, to_node, weight}
 * @returns {Array} Array of node IDs representing the path, or null if no path found
 */
export function findShortestPath(startId, endId, nodes, edges) {
  if (!startId || !endId || !nodes || !edges) return null;

  // 1. Build adjacency list for quick neighbor lookup
  const adjList = {};
  nodes.forEach(n => adjList[n.id] = []);
  
  edges.forEach(e => {
    // Undirected graph
    if (adjList[e.from_node] && adjList[e.to_node]) {
      adjList[e.from_node].push({ target: e.to_node, weight: e.weight });
      adjList[e.to_node].push({ target: e.from_node, weight: e.weight });
    }
  });

  const nodesMap = new Map(nodes.map(n => [n.id, n]));
  const endNode = nodesMap.get(endId);
  
  if (!endNode || !nodesMap.has(startId)) return null;

  // A* Initialization
  const openSet = new Set([startId]); // Nodes to evaluate
  const closedSet = new Set(); // Nodes already evaluated
  
  // cameFrom[nodeId] = previousNodeId on cheapest path
  const cameFrom = {};
  
  // gScore: cost from start to node
  const gScore = {};
  nodes.forEach(n => gScore[n.id] = Infinity);
  gScore[startId] = 0;
  
  // fScore: gScore + heuristic cost to goal
  const fScore = {};
  nodes.forEach(n => fScore[n.id] = Infinity);
  fScore[startId] = heuristic(nodesMap.get(startId), endNode);

  while (openSet.size > 0) {
    // Find node in openSet with lowest fScore
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
        // Not a better path
        continue;
      }

      // This path is the best until now
      cameFrom[neighbor.target] = currentId;
      gScore[neighbor.target] = tentativeGScore;
      fScore[neighbor.target] = gScore[neighbor.target] + heuristic(nodesMap.get(neighbor.target), endNode);
    }
  }

  // No path found
  return null;
}

/**
 * Helper: Find the closest node to a given room's center
 */
export function findClosestNodeToRoom(room, nodes) {
  if (!room || !room.shape_data || nodes.length === 0) return null;
  
  // Calculate center of room
  let sumX = 0;
  let sumY = 0;
  room.shape_data.forEach(pt => {
    sumX += pt[0];
    sumY += pt[1];
  });
  const centerX = sumX / room.shape_data.length;
  const centerY = sumY / room.shape_data.length;

  // Find closest node
  let closest = null;
  let minDistance = Infinity;

  nodes.forEach(node => {
    const dx = node.x - centerX;
    const dy = node.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDistance) {
      minDistance = dist;
      closest = node;
    }
  });

  return closest;
}
