-- Add lead_time_days and safety_stock_days to catalog
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS lead_time_days INT DEFAULT 3;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS safety_stock_days INT DEFAULT 3;
COMMENT ON COLUMN catalog.lead_time_days IS 'Lead time in days for this SKU (supplier delivery)';
COMMENT ON COLUMN catalog.safety_stock_days IS 'Safety stock buffer in days of demand';
