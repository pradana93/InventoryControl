import pg from 'pg';
import fs from 'fs';
import path from 'path';

const url = 'postgresql://postgres.llmpggljjodyrevnzwxg:Apexpred93%40@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node scripts/run-migration.mjs <path-to-sql>');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(migrationFile), 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log(`Running migration: ${migrationFile}`);
  await client.query(sql);
  console.log('Migration completed successfully.');

  const t = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log('Tables now:', t.rows.map(x => x.tablename).join(', '));

  const v = await client.query("SELECT viewname FROM pg_views WHERE schemaname='public' ORDER BY viewname");
  console.log('Views now:', v.rows.map(x => x.viewname).join(', '));

  await client.end();
} catch (e) {
  console.error('MIGRATION ERROR:', e.message);
  if (e.position) console.error('Position:', e.position);
  await client.end();
  process.exit(1);
}