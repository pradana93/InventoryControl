import pg from 'pg';

const url = 'postgresql://postgres.llmpggljjodyrevnzwxg:Apexpred93%40@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

// Drop dependent views first
await c.query(`DROP VIEW IF EXISTS inventory_lots CASCADE;`);
await c.query(`DROP VIEW IF EXISTS current_stock CASCADE;`);
await c.query(`DROP VIEW IF EXISTS empty_racks CASCADE;`);
console.log('✓ Dropped views');

// Widen numerics
await c.query(`
  ALTER TABLE stock_opname
    ALTER COLUMN variance TYPE NUMERIC(14,2),
    ALTER COLUMN akurasi_pct TYPE NUMERIC(10,2);
`);
console.log('✓ Widened variance -> NUMERIC(14,2) and akurasi_pct -> NUMERIC(10,2)');

await c.end();
