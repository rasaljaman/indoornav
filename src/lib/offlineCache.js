/**
 * Offline Data Cache for IndoorNav
 * 
 * Implements an IndexedDB-based offline-first caching layer for organization map data.
 * Once an organization is loaded, its full navigation bundle (buildings, floors, rooms,
 * nodes, edges, QR points) is persisted locally.
 * 
 * Lookups for room search, pathfinding, and QR re-anchoring resolve directly from
 * local storage when offline or network requests timeout.
 */

const DB_NAME = 'IndoorNavDB';
const DB_VERSION = 1;
const STORE_NAME = 'org_cache';

/**
 * Opens or upgrades the IndexedDB database
 */
export function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'orgSlug' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves cached organization data from IndexedDB
 */
export async function getCachedOrg(orgSlug) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(orgSlug);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB read failed:', err);
    return null;
  }
}

/**
 * Saves organization data bundle to IndexedDB
 */
export async function saveCachedOrg(orgSlug, dataBundle) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        orgSlug,
        orgId: dataBundle.org?.id,
        timestamp: Date.now(),
        data: dataBundle
      };

      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB write failed:', err);
    return false;
  }
}

/**
 * Fetches all organization map data from Supabase in batch
 */
export async function fetchAllOrgDataFromSupabase(orgSlug, supabase) {
  // 1. Fetch organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', orgSlug)
    .single();

  if (orgError || !org) {
    throw new Error(`Organization '${orgSlug}' not found.`);
  }

  // 2. Fetch all buildings for this org
  const { data: buildings } = await supabase
    .from('buildings')
    .select('*')
    .eq('org_id', org.id)
    .order('name');

  const buildingList = buildings || [];
  const buildingIds = buildingList.map(b => b.id);

  let floors = [];
  let rooms = [];
  let nodes = [];
  let edges = [];
  let qrPoints = [];

  if (buildingIds.length > 0) {
    // 3. Fetch all floors across buildings
    const { data: floorsData } = await supabase
      .from('floors')
      .select('*')
      .in('building_id', buildingIds)
      .order('level');

    floors = floorsData || [];
    const floorIds = floors.map(f => f.id);

    if (floorIds.length > 0) {
      // 4. Fetch all rooms across floors
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('*')
        .in('floor_id', floorIds);
      rooms = roomsData || [];

      // 5. Fetch all nodes across floors
      const { data: nodesData } = await supabase
        .from('nodes')
        .select('*')
        .in('floor_id', floorIds);
      nodes = nodesData || [];
      const nodeIds = nodes.map(n => n.id);

      if (nodeIds.length > 0) {
        // 6. Fetch all edges for these nodes
        const { data: edgesData } = await supabase
          .from('edges')
          .select('*')
          .in('from_node', nodeIds);
        edges = edgesData || [];

        // 7. Fetch all QR points for these nodes
        const { data: qrData } = await supabase
          .from('qr_points')
          .select('*')
          .in('node_id', nodeIds);
        qrPoints = qrData || [];
      }
    }
  }

  return {
    org,
    buildings: buildingList,
    floors,
    rooms,
    nodes,
    edges,
    qrPoints
  };
}

/**
 * Offline-First Orchestrator:
 * 1. Checks IndexedDB first.
 * 2. If present, returns cached data immediately.
 * 3. Checks staleness (> 24h) and triggers background refresh if online.
 * 4. If absent, fetches from Supabase and populates cache.
 * 5. If absent and offline, returns NO_OFFLINE_CACHE error.
 */
export async function loadOrgDataOfflineFirst(
  orgSlug,
  supabase,
  { maxAgeMs = 24 * 60 * 60 * 1000 } = {}
) {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // 1. Check local cache
  const cached = await getCachedOrg(orgSlug);

  if (cached && cached.data) {
    const isStale = Date.now() - cached.timestamp > maxAgeMs;

    // Background refresh if online and stale
    if (isStale && isOnline && supabase) {
      fetchAllOrgDataFromSupabase(orgSlug, supabase)
        .then(freshData => saveCachedOrg(orgSlug, freshData))
        .catch(err => console.warn('Background cache refresh failed:', err));
    }

    return {
      data: cached.data,
      fromCache: true,
      isStale,
      timestamp: cached.timestamp
    };
  }

  // 2. If not cached and offline, fail gracefully
  if (!isOnline) {
    return {
      data: null,
      fromCache: false,
      error: 'NO_OFFLINE_CACHE',
      message: 'First-time setup requires an internet connection to download the indoor map.'
    };
  }

  // 3. Fetch live from Supabase and cache locally
  if (!supabase) {
    throw new Error('Supabase client required for live fetch');
  }

  const freshData = await fetchAllOrgDataFromSupabase(orgSlug, supabase);
  await saveCachedOrg(orgSlug, freshData);

  return {
    data: freshData,
    fromCache: false,
    isStale: false,
    timestamp: Date.now()
  };
}

/**
 * Finds a node by ID in the cached organization dataset
 */
export function findNodeInOrgData(orgData, nodeId) {
  if (!orgData || !orgData.nodes || !nodeId) return null;
  const node = orgData.nodes.find(n => n.id === nodeId);
  if (!node) return null;

  const floor = orgData.floors?.find(f => f.id === node.floor_id);
  return {
    ...node,
    floors: floor ? { name: floor.name, building_id: floor.building_id, map_width: floor.map_width, real_width_m: floor.real_width_m } : null
  };
}

/**
 * Finds a node by QR code value or URL in the cached organization dataset
 */
export function findNodeByQrInOrgData(orgData, qrString) {
  if (!orgData || !orgData.qrPoints || !qrString) return null;

  // Exact match or matches URL loc param
  let matchedPoint = orgData.qrPoints.find(q => q.qr_code_value === qrString);

  if (!matchedPoint) {
    try {
      const url = new URL(qrString);
      const loc = url.searchParams.get('loc');
      if (loc) {
        return findNodeInOrgData(orgData, loc);
      }
    } catch {
      // Not a full URL, continue
    }
  }

  if (matchedPoint) {
    return findNodeInOrgData(orgData, matchedPoint.node_id);
  }

  return null;
}

/**
 * Filters cached rooms, nodes, and edges for a specific floor
 */
export function getFloorDataFromOrgData(orgData, floorId) {
  if (!orgData || !floorId) return null;

  const floor = orgData.floors?.find(f => f.id === floorId) || null;
  const rooms = orgData.rooms?.filter(r => r.floor_id === floorId) || [];
  const nodes = orgData.nodes?.filter(n => n.floor_id === floorId) || [];
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = orgData.edges?.filter(e => nodeIds.has(e.from_node) && nodeIds.has(e.to_node)) || [];

  return {
    floor,
    rooms,
    nodes,
    edges
  };
}

/**
 * Subscribes to browser online/offline status changes
 */
export function listenNetworkStatus(onChange) {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => onChange(true);
  const handleOffline = () => onChange(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
