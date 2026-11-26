-- Add unit_cost to catalog
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 2) DEFAULT 0;

-- Enhance stock_opname
ALTER TABLE stock_opname ADD COLUMN IF NOT EXISTS selisih_rp NUMERIC(16, 2) DEFAULT 0;
ALTER TABLE stock_opname ADD COLUMN IF NOT EXISTS tolerance_status TEXT CHECK (tolerance_status IN ('Akurat', 'Toleransi', 'Selisih'));
ALTER TABLE stock_opname ADD COLUMN IF NOT EXISTS petugas TEXT;
ALTER TABLE stock_opname ADD COLUMN IF NOT EXISTS catatan TEXT;
