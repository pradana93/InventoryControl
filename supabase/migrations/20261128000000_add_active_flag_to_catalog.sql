-- Add activeFlag column to catalog table
-- True = SKU is active and visible in operational views; False = SKU is archived/inactive

ALTER TABLE catalog ADD COLUMN IF NOT EXISTS activeFlag BOOLEAN DEFAULT true;
COMMENT ON COLUMN catalog.activeFlag IS 'True = SKU is active and visible in operational views; False = SKU is archived/inactive';

-- Optional: Add index for filtering active SKUs
CREATE INDEX IF NOT EXISTS idx_catalog_active_flag ON catalog(activeFlag);