-- IndoorNav — Initial Database Schema
-- Run this migration in your Supabase SQL Editor

-- ============================================================
-- 1. ORGANIZATIONS (tenants)
-- ============================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('college', 'hospital', 'mall', 'other')),
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_organizations_slug ON organizations (slug);

-- ============================================================
-- 2. ADMINS (per org — linked to Supabase Auth)
-- ============================================================
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'org_admin' CHECK (role IN ('super_admin', 'org_admin')),
  auth_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admins_auth_id ON admins (auth_id);
CREATE INDEX idx_admins_org_id ON admins (org_id);

-- ============================================================
-- 3. BUILDINGS (an org can have multiple)
-- ============================================================
CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_buildings_org_id ON buildings (org_id);

-- ============================================================
-- 4. FLOORS (with real-world scale + compass offset)
-- ============================================================
CREATE TABLE floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  level INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  map_width INT NOT NULL DEFAULT 1920,
  map_height INT NOT NULL DEFAULT 1080,
  real_width_m FLOAT,
  real_height_m FLOAT,
  compass_offset FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_floors_building_id ON floors (building_id);

-- ============================================================
-- 5. ROOMS / DEPARTMENTS (with shape, category, color)
-- ============================================================
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  shape_data JSONB,
  category TEXT DEFAULT 'other' CHECK (category IN ('lab', 'office', 'department', 'washroom', 'stairs', 'lift', 'entrance', 'other')),
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rooms_floor_id ON rooms (floor_id);

-- ============================================================
-- 6. CORRIDOR GRAPH NODES (walkable points)
-- ============================================================
CREATE TABLE nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  type TEXT NOT NULL DEFAULT 'junction' CHECK (type IN ('junction', 'stairs', 'lift', 'entrance', 'room_door')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nodes_floor_id ON nodes (floor_id);

-- ============================================================
-- 7. CORRIDOR GRAPH EDGES (walkable connections, weight in meters)
-- ============================================================
CREATE TABLE edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  weight FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_edges_from_node ON edges (from_node);
CREATE INDEX idx_edges_to_node ON edges (to_node);

-- ============================================================
-- 8. FLOOR CONNECTORS (cross-floor links: stairs/lift/ramp)
-- ============================================================
CREATE TABLE floor_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_a UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  node_b UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'stairs' CHECK (type IN ('stairs', 'lift', 'ramp')),
  weight FLOAT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_floor_connectors_nodes ON floor_connectors (node_a, node_b);

-- ============================================================
-- 9. QR ANCHOR POINTS (printed and placed physically)
-- ============================================================
CREATE TABLE qr_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  qr_code_value TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qr_points_node_id ON qr_points (node_id);
CREATE INDEX idx_qr_points_value ON qr_points (qr_code_value);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_points ENABLE ROW LEVEL SECURITY;

-- Helper function: get the current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM admins WHERE auth_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get the current user's org_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM admins WHERE auth_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- ORGANIZATIONS policies
-- ============================================================

-- Public: anyone can read organizations (for visitor landing page)
CREATE POLICY "orgs_public_read" ON organizations
  FOR SELECT USING (true);

-- Super admin: full CRUD
CREATE POLICY "orgs_super_admin_all" ON organizations
  FOR ALL USING (get_user_role() = 'super_admin');

-- ============================================================
-- ADMINS policies
-- ============================================================

-- Super admin: full CRUD on all admins
CREATE POLICY "admins_super_admin_all" ON admins
  FOR ALL USING (get_user_role() = 'super_admin');

-- Org admin: can read their own record
CREATE POLICY "admins_self_read" ON admins
  FOR SELECT USING (auth_id = auth.uid());

-- ============================================================
-- BUILDINGS policies
-- ============================================================

-- Public: read all buildings (visitors need this)
CREATE POLICY "buildings_public_read" ON buildings
  FOR SELECT USING (true);

-- Super admin: full CRUD
CREATE POLICY "buildings_super_admin_all" ON buildings
  FOR ALL USING (get_user_role() = 'super_admin');

-- Org admin: CRUD only their own org's buildings
CREATE POLICY "buildings_org_admin_all" ON buildings
  FOR ALL USING (org_id = get_user_org_id());

-- ============================================================
-- FLOORS policies
-- ============================================================

-- Public: read all floors (visitors need this)
CREATE POLICY "floors_public_read" ON floors
  FOR SELECT USING (true);

-- Super admin: full CRUD
CREATE POLICY "floors_super_admin_all" ON floors
  FOR ALL USING (get_user_role() = 'super_admin');

-- Org admin: CRUD floors in their own org's buildings
CREATE POLICY "floors_org_admin_all" ON floors
  FOR ALL USING (
    building_id IN (SELECT id FROM buildings WHERE org_id = get_user_org_id())
  );

-- ============================================================
-- ROOMS policies
-- ============================================================

-- Public: read all rooms (visitors need this)
CREATE POLICY "rooms_public_read" ON rooms
  FOR SELECT USING (true);

-- Super admin: full CRUD
CREATE POLICY "rooms_super_admin_all" ON rooms
  FOR ALL USING (get_user_role() = 'super_admin');

-- Org admin: CRUD rooms in their own org's floors
CREATE POLICY "rooms_org_admin_all" ON rooms
  FOR ALL USING (
    floor_id IN (
      SELECT f.id FROM floors f
      JOIN buildings b ON f.building_id = b.id
      WHERE b.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- NODES policies
-- ============================================================

-- Public: read all nodes (visitors need this for pathfinding)
CREATE POLICY "nodes_public_read" ON nodes
  FOR SELECT USING (true);

-- Super admin: full CRUD
CREATE POLICY "nodes_super_admin_all" ON nodes
  FOR ALL USING (get_user_role() = 'super_admin');

-- Org admin: CRUD nodes in their own org's floors
CREATE POLICY "nodes_org_admin_all" ON nodes
  FOR ALL USING (
    floor_id IN (
      SELECT f.id FROM floors f
      JOIN buildings b ON f.building_id = b.id
      WHERE b.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- EDGES policies
-- ============================================================

-- Public: read all edges (visitors need this for pathfinding)
CREATE POLICY "edges_public_read" ON edges
  FOR SELECT USING (true);

-- Super admin: full CRUD
CREATE POLICY "edges_super_admin_all" ON edges
  FOR ALL USING (get_user_role() = 'super_admin');

-- Org admin: CRUD edges connected to their own org's nodes
CREATE POLICY "edges_org_admin_all" ON edges
  FOR ALL USING (
    from_node IN (
      SELECT n.id FROM nodes n
      JOIN floors f ON n.floor_id = f.id
      JOIN buildings b ON f.building_id = b.id
      WHERE b.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- FLOOR_CONNECTORS policies
-- ============================================================

-- Public: read all connectors (visitors need this for multi-floor routing)
CREATE POLICY "connectors_public_read" ON floor_connectors
  FOR SELECT USING (true);

-- Super admin: full CRUD
CREATE POLICY "connectors_super_admin_all" ON floor_connectors
  FOR ALL USING (get_user_role() = 'super_admin');

-- Org admin: CRUD connectors for their own org's nodes
CREATE POLICY "connectors_org_admin_all" ON floor_connectors
  FOR ALL USING (
    node_a IN (
      SELECT n.id FROM nodes n
      JOIN floors f ON n.floor_id = f.id
      JOIN buildings b ON f.building_id = b.id
      WHERE b.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- QR_POINTS policies
-- ============================================================

-- Public: read all QR points (visitors need this for scanning)
CREATE POLICY "qr_public_read" ON qr_points
  FOR SELECT USING (true);

-- Super admin: full CRUD
CREATE POLICY "qr_super_admin_all" ON qr_points
  FOR ALL USING (get_user_role() = 'super_admin');

-- Org admin: CRUD QR points for their own org's nodes
CREATE POLICY "qr_org_admin_all" ON qr_points
  FOR ALL USING (
    node_id IN (
      SELECT n.id FROM nodes n
      JOIN floors f ON n.floor_id = f.id
      JOIN buildings b ON f.building_id = b.id
      WHERE b.org_id = get_user_org_id()
    )
  );
