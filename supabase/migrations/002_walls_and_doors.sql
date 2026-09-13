-- IndoorNav — Stage M3: Walls and Doors Tables Migration

-- ============================================================
-- 1. WALLS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS walls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  x1 FLOAT NOT NULL,
  y1 FLOAT NOT NULL,
  x2 FLOAT NOT NULL,
  y2 FLOAT NOT NULL,
  thickness FLOAT NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_walls_floor_id ON walls (floor_id);

-- Enable RLS
ALTER TABLE walls ENABLE ROW LEVEL SECURITY;

-- Public read for visitor view
CREATE POLICY "walls_public_read" ON walls
  FOR SELECT USING (true);

-- Super admin full CRUD
CREATE POLICY "walls_super_admin_all" ON walls
  FOR ALL USING (get_user_role() = 'super_admin');

-- Org admin CRUD on their organization's floors
CREATE POLICY "walls_org_admin_all" ON walls
  FOR ALL USING (
    floor_id IN (
      SELECT f.id FROM floors f
      JOIN buildings b ON f.building_id = b.id
      WHERE b.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- 2. DOORS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS doors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wall_id UUID NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
  position_along_wall FLOAT NOT NULL DEFAULT 0.5,
  width FLOAT NOT NULL DEFAULT 40,
  swing_direction TEXT NOT NULL DEFAULT 'right_in' CHECK (swing_direction IN ('left_in', 'right_in', 'left_out', 'right_out')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doors_wall_id ON doors (wall_id);

-- Enable RLS
ALTER TABLE doors ENABLE ROW LEVEL SECURITY;

-- Public read for visitor view
CREATE POLICY "doors_public_read" ON doors
  FOR SELECT USING (true);

-- Super admin full CRUD
CREATE POLICY "doors_super_admin_all" ON doors
  FOR ALL USING (get_user_role() = 'super_admin');

-- Org admin CRUD on their organization's walls
CREATE POLICY "doors_org_admin_all" ON doors
  FOR ALL USING (
    wall_id IN (
      SELECT w.id FROM walls w
      JOIN floors f ON w.floor_id = f.id
      JOIN buildings b ON f.building_id = b.id
      WHERE b.org_id = get_user_org_id()
    )
  );
