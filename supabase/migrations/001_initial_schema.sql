-- ============================================================================
-- INVENTORY CONTROL - INITIAL SCHEMA
-- ============================================================================
-- Migrated from Google Sheets architecture
-- Entities: BBB (PT Bangor Berkembang Bersama), BBT (PT Bangor Berani Terukur)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================
CREATE TYPE entity_type AS ENUM ('BBB', 'BBT');
CREATE TYPE sku_status AS ENUM ('Active', 'Inactive');
CREATE TYPE rack_status AS ENUM ('Active', 'Inactive');
CREATE TYPE location_type AS ENUM ('RACKING', 'FLOOR', 'CONTAINER', 'FREEZER');
CREATE TYPE fefo_status AS ENUM ('OK', 'EXPIRED HARI INI', 'EXPIRED', 'HABIS');

-- ============================================================================
-- USERS (Auth + Roles)
-- ============================================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('super-admin', 'manager', 'operator')),
  entity entity_type, -- NULL means all entities (super-admin)
  password_hash TEXT, -- For credentials provider
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for auth lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_entity ON users(entity);

-- ============================================================================
-- CATALOG (SKU Master Data)
-- ============================================================================
CREATE TABLE catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id TEXT UNIQUE NOT NULL,
  nama_barang TEXT NOT NULL,
  satuan TEXT DEFAULT 'Pcs',
  kategori TEXT DEFAULT 'General',
  status sku_status DEFAULT 'Active',
  entitas entity_type NOT NULL,
  barcode TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_catalog_entitas ON catalog(entitas);
CREATE INDEX idx_catalog_status ON catalog(status);
CREATE INDEX idx_catalog_nama_barang ON catalog(nama_barang);
CREATE INDEX idx_catalog_barcode ON catalog(barcode);

-- ============================================================================
-- PHYSICAL_WAREHOUSE (Rack Layout)
-- ============================================================================
CREATE TABLE physical_warehouse (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rack_id TEXT UNIQUE NOT NULL,
  jenis_lokasi location_type NOT NULL DEFAULT 'RACKING',
  entitas entity_type NOT NULL,
  status rack_status DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_warehouse_entitas ON physical_warehouse(entitas);
CREATE INDEX idx_warehouse_status ON physical_warehouse(status);
CREATE INDEX idx_warehouse_jenis_lokasi ON physical_warehouse(jenis_lokasi);

-- ============================================================================
-- LEDGER (Transaction Log - Source of Truth)
-- ============================================================================
CREATE TABLE ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  record_id TEXT UNIQUE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  sku_name TEXT NOT NULL,
  rack_id TEXT NOT NULL,
  qty_in DECIMAL(12, 2) NOT NULL DEFAULT 0,
  expired_date DATE,
  sj_number TEXT,
  remarks TEXT,
  entitas entity_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ledger_timestamp ON ledger(timestamp DESC);
CREATE INDEX idx_ledger_sku_name ON ledger(sku_name);
CREATE INDEX idx_ledger_rack_id ON ledger(rack_id);
CREATE INDEX idx_ledger_entitas ON ledger(entitas);
CREATE INDEX idx_ledger_expired_date ON ledger(expired_date);
CREATE INDEX idx_ledger_sku_rack_expired ON ledger(sku_name, rack_id, expired_date);

-- ============================================================================
-- STOCK_OPNAME (Physical Count / Cycle Count)
-- ============================================================================
CREATE TABLE stock_opname (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rack_id TEXT NOT NULL,
  sku_name TEXT NOT NULL,
  qty_sistem DECIMAL(12, 2) NOT NULL DEFAULT 0,
  qty_fisik_soh DECIMAL(12, 2) NOT NULL DEFAULT 0,
  variance DECIMAL(12, 2) GENERATED ALWAYS AS (qty_fisik_soh - qty_sistem) STORED,
  akurasi_pct DECIMAL(5, 2) GENERATED ALWAYS AS (
    CASE 
      WHEN qty_sistem > 0 THEN ROUND((qty_fisik_soh / qty_sistem) * 100, 2)
      ELSE 100.00
    END
  ) STORED,
  tanggal_opname DATE NOT NULL DEFAULT CURRENT_DATE,
  petugas TEXT,
  catatan TEXT,
  entitas entity_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (rack_id, sku_name, entitas)
);

CREATE INDEX idx_opname_rack_id ON stock_opname(rack_id);
CREATE INDEX idx_opname_sku_name ON stock_opname(sku_name);
CREATE INDEX idx_opname_entitas ON stock_opname(entitas);
CREATE INDEX idx_opname_tanggal ON stock_opname(tanggal_opname DESC);

-- ============================================================================
-- RACK_LABELS (Label References)
-- ============================================================================
CREATE TABLE rack_labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rack_id TEXT NOT NULL,
  sku_name TEXT,
  jenis_lokasi location_type NOT NULL DEFAULT 'RACKING',
  barcode TEXT,
  qr_url TEXT,
  entitas entity_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (rack_id, entitas)
);

CREATE INDEX idx_rack_labels_rack_id ON rack_labels(rack_id);
CREATE INDEX idx_rack_labels_entitas ON rack_labels(entitas);

-- ============================================================================
-- PICKING_LIST (Outbound Picking Lists)
-- ============================================================================
CREATE TYPE picking_status AS ENUM ('PENDING', 'ALLOCATED', 'PICKING', 'CONFIRMED', 'CANCELLED');

CREATE TABLE picking_list (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  picking_list_no TEXT UNIQUE NOT NULL,
  status picking_status DEFAULT 'PENDING',
  entitas entity_type NOT NULL,
  created_by UUID REFERENCES users(id),
  confirmed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX idx_picking_status ON picking_list(status);
CREATE INDEX idx_picking_entitas ON picking_list(entitas);

CREATE TABLE picking_list_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  picking_list_id UUID NOT NULL REFERENCES picking_list(id) ON DELETE CASCADE,
  sku_name TEXT NOT NULL,
  qty_requested DECIMAL(12, 2) NOT NULL DEFAULT 0,
  qty_allocated DECIMAL(12, 2) NOT NULL DEFAULT 0,
  qty_picked DECIMAL(12, 2) NOT NULL DEFAULT 0,
  rack_id TEXT,
  expired_date DATE,
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_picking_items_list ON picking_list_items(picking_list_id);
CREATE INDEX idx_picking_items_sku ON picking_list_items(sku_name);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Enable RLS on all tables
ALTER TABLE catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_warehouse ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opname ENABLE ROW LEVEL SECURITY;
ALTER TABLE rack_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE picking_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE picking_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see data for their entity (or all if super-admin)
-- Super-admin check via auth.jwt() -> role claim
-- For now, using simple policies - will refine with Supabase Auth integration

-- Catalog: All authenticated users can read; super-admin can write
CREATE POLICY "catalog_read" ON catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalog_write" ON catalog FOR ALL TO authenticated 
  USING (auth.jwt() ->> 'role' = 'super-admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'super-admin');

-- Warehouse: All authenticated users can read; super-admin can write
CREATE POLICY "warehouse_read" ON physical_warehouse FOR SELECT TO authenticated USING (true);
CREATE POLICY "warehouse_write" ON physical_warehouse FOR ALL TO authenticated 
  USING (auth.jwt() ->> 'role' = 'super-admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'super-admin');

-- Ledger: Entity-scoped reads for manager/operator; all writes for authenticated
CREATE POLICY "ledger_read" ON ledger FOR SELECT TO authenticated 
  USING (
    auth.jwt() ->> 'role' = 'super-admin' 
    OR entitas = (auth.jwt() ->> 'entity')::entity_type
  );
CREATE POLICY "ledger_write" ON ledger FOR INSERT TO authenticated WITH CHECK (true);

-- Stock Opname: Entity-scoped
CREATE POLICY "opname_read" ON stock_opname FOR SELECT TO authenticated 
  USING (
    auth.jwt() ->> 'role' = 'super-admin' 
    OR entitas = (auth.jwt() ->> 'entity')::entity_type
  );
CREATE POLICY "opname_write" ON stock_opname FOR ALL TO authenticated 
  USING (
    auth.jwt() ->> 'role' = 'super-admin' 
    OR entitas = (auth.jwt() ->> 'entity')::entity_type
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'super-admin' 
    OR entitas = (auth.jwt() ->> 'entity')::entity_type
  );

-- Rack Labels: All authenticated users can read; super-admin can write
CREATE POLICY "rack_labels_read" ON rack_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "rack_labels_write" ON rack_labels FOR ALL TO authenticated 
  USING (auth.jwt() ->> 'role' = 'super-admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'super-admin');

-- Picking List: Entity-scoped
CREATE POLICY "picking_read" ON picking_list FOR SELECT TO authenticated 
  USING (
    auth.jwt() ->> 'role' = 'super-admin' 
    OR entitas = (auth.jwt() ->> 'entity')::entity_type
  );
CREATE POLICY "picking_write" ON picking_list FOR ALL TO authenticated 
  USING (
    auth.jwt() ->> 'role' = 'super-admin' 
    OR entitas = (auth.jwt() ->> 'entity')::entity_type
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'super-admin' 
    OR entitas = (auth.jwt() ->> 'entity')::entity_type
  );

-- Picking List Items: Entity-scoped via parent
CREATE POLICY "picking_items_read" ON picking_list_items FOR SELECT TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM picking_list pl 
      WHERE pl.id = picking_list_items.picking_list_id 
      AND (auth.jwt() ->> 'role' = 'super-admin' OR pl.entitas = (auth.jwt() ->> 'entity')::entity_type::entity_type)
    )
  );
CREATE POLICY "picking_items_write" ON picking_list_items FOR ALL TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM picking_list pl 
      WHERE pl.id = picking_list_items.picking_list_id 
      AND (auth.jwt() ->> 'role' = 'super-admin' OR pl.entitas = (auth.jwt() ->> 'entity')::entity_type::entity_type)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM picking_list pl 
      WHERE pl.id = picking_list_items.picking_list_id 
      AND (auth.jwt() ->> 'role' = 'super-admin' OR pl.entitas = (auth.jwt() ->> 'entity')::entity_type::entity_type)
    )
  );

-- Users: Users can read their own profile; super-admin can read all
CREATE POLICY "users_self_read" ON users FOR SELECT TO authenticated 
  USING (id = auth.uid() OR auth.jwt() ->> 'role' = 'super-admin');
CREATE POLICY "users_self_update" ON users FOR UPDATE TO authenticated 
  USING (id = auth.uid() OR auth.jwt() ->> 'role' = 'super-admin');

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Current stock per lot (rack + sku + expiry) - computed from ledger + opname
CREATE VIEW current_stock AS
SELECT 
  l.rack_id,
  l.sku_name,
  l.expired_date,
  SUM(l.qty_in) AS qty_sistem,
  COALESCE(o.qty_fisik_soh, 0) AS soh,
  COALESCE(o.variance, 0) AS variance,
  COALESCE(o.akurasi_pct, 100) AS akurasi,
  MAX(l.timestamp) AS latest_inbound,
  pw.jenis_lokasi,
  pw.entitas,
  c.sku_id,
  c.barcode,
  c.kategori,
  c.satuan
FROM ledger l
JOIN physical_warehouse pw ON pw.rack_id = l.rack_id
LEFT JOIN catalog c ON LOWER(c.nama_barang) = LOWER(l.sku_name) AND c.entitas = l.entitas
LEFT JOIN stock_opname o ON o.rack_id = l.rack_id 
  AND LOWER(o.sku_name) = LOWER(l.sku_name) 
  AND o.entitas = l.entitas
GROUP BY l.rack_id, l.sku_name, l.expired_date, pw.jenis_lokasi, pw.entitas, c.sku_id, c.barcode, c.kategori, c.satuan, o.qty_fisik_soh, o.variance, o.akurasi_pct;

-- Empty racks (from warehouse, no ledger entries)
CREATE VIEW empty_racks AS
SELECT 
  pw.rack_id,
  pw.jenis_lokasi,
  pw.entitas,
  pw.status
FROM physical_warehouse pw
WHERE pw.status = 'Active'
AND NOT EXISTS (
  SELECT 1 FROM ledger l WHERE l.rack_id = pw.rack_id AND l.qty_in > 0
);

-- ============================================================================
-- SEED DATA: DEFAULT SUPER ADMIN
-- ============================================================================
-- Password: 'inventory123' (hashed with bcrypt)
-- Note: In production, use proper password hashing
INSERT INTO users (email, name, role, entity, password_hash)
VALUES (
  'majestap93@gmail.com', 
  'Super Admin', 
  'super-admin', 
  NULL, 
  '$2b$10$YourHashedPasswordHere'  -- Will be updated via auth system
) ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Calculate days to expiry
CREATE OR REPLACE FUNCTION calculate_days_to_expiry(expired_date DATE)
RETURNS INTEGER AS $$
BEGIN
  IF expired_date IS NULL THEN
    RETURN 9999;
  END IF;
  RETURN EXTRACT(DAY FROM (expired_date - CURRENT_DATE))::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate FEFO status
CREATE OR REPLACE FUNCTION calculate_fefo_status(days_to_expiry INTEGER, qty_sistem DECIMAL)
RETURNS fefo_status AS $$
BEGIN
  IF qty_sistem <= 0 THEN
    RETURN 'HABIS'::fefo_status;
  END IF;
  IF days_to_expiry < 0 THEN
    RETURN 'EXPIRED'::fefo_status;
  END IF;
  IF days_to_expiry = 0 THEN
    RETURN 'EXPIRED HARI INI'::fefo_status;
  END IF;
  RETURN 'OK'::fefo_status;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Inventory lots view (computed, matches InventoryLot interface)
CREATE VIEW inventory_lots AS
SELECT 
  cs.rack_id AS nomor_rak,
  cs.sku_name AS nama_barang,
  cs.qty_sistem,
  cs.latest_inbound AS tanggal_inbound,
  cs.expired_date AS tanggal_expired,
  TO_CHAR(cs.expired_date, 'DD Mon YYYY') AS expired_label,
  calculate_days_to_expiry(cs.expired_date) AS days_to_expiry,
  cs.soh,
  cs.variance,
  cs.akurasi,
  calculate_fefo_status(calculate_days_to_expiry(cs.expired_date), cs.qty_sistem) AS status_fefo,
  0 AS urutan_fefo, -- Will be computed in application
  0 AS stock_picking, -- Will be computed in application
  cs.barcode,
  cs.kategori AS category,
  cs.satuan AS unit,
  cs.sku_id,
  cs.jenis_lokasi,
  cs.entitas
FROM current_stock cs
WHERE cs.qty_sistem > 0
UNION ALL
SELECT 
  er.rack_id AS nomor_rak,
  '-' AS nama_barang,
  0 AS qty_sistem,
  NULL::timestamptz AS tanggal_inbound,
  NULL::date AS tanggal_expired,
  '-' AS expired_label,
  9999 AS days_to_expiry,
  0 AS soh,
  0 AS variance,
  100 AS akurasi,
  'OK'::fefo_status AS status_fefo,
  0 AS urutan_fefo,
  0 AS stock_picking,
  '' AS barcode,
  '' AS category,
  'Pcs' AS unit,
  '' AS sku_id,
  er.jenis_lokasi,
  er.entitas
FROM empty_racks er;
