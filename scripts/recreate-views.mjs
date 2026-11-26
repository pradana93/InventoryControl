import pg from 'pg';

const url = 'postgresql://postgres.llmpggljjodyrevnzwxg:Apexpred93%40@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

await c.query(`
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
`);
console.log('✓ Recreated current_stock');

await c.query(`
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
`);
console.log('✓ Recreated empty_racks');

await c.query(`
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
  0 AS urutan_fefo,
  0 AS stock_picking,
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
`);
console.log('✓ Recreated inventory_lots');

const v = await c.query("SELECT viewname FROM pg_views WHERE schemaname='public' ORDER BY viewname");
console.log('Views now:', v.rows.map(r => r.viewname).join(', '));

await c.end();
