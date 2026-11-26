import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { getCatalog, getWarehouse, getLedger, getStockOpname, getRackLabels } from '../src/lib/google-sheets.ts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

try {
  console.log('Fetching data from Google Sheets...');
  const [catalog, warehouse, ledger, opname, labels] = await Promise.all([
    getCatalog(), getWarehouse(), getLedger(), getStockOpname(), getRackLabels()
  ]);

  console.log(`Fetched: Catalog(${catalog.length}), Warehouse(${warehouse.length}), Ledger(${ledger.length}), Opname(${opname.length}), Labels(${labels.length})`);

  // 1. Migrate Catalog
  if (catalog.length > 0) {
    console.log('Migrating catalog...');
    const rows = catalog.map(c => ({
      sku_id: c.skuId,
      nama_barang: c.namaBarang,
      satuan: c.satuan,
      kategori: c.kategori,
      status: c.status,
      entitas: c.entitas,
      barcode: c.barcode,
    }));
    const { error } = await supabase.from('catalog').upsert(rows, { onConflict: 'sku_id' });
    if (error) console.error('Catalog migration error:', error);
    else console.log('Catalog migrated successfully.');
  }

  // 2. Migrate Warehouse
  if (warehouse.length > 0) {
    console.log('Migrating warehouse...');
    const rows = warehouse.map(w => ({
      rack_id: w.rackId,
      jenis_lokasi: w.jenisLokasi,
      entitas: w.entitas,
      status: w.status,
    }));
    const { error } = await supabase.from('physical_warehouse').upsert(rows, { onConflict: 'rack_id' });
    if (error) console.error('Warehouse migration error:', error);
    else console.log('Warehouse migrated successfully.');
  }

  // 3. Migrate Ledger
  if (ledger.length > 0) {
    console.log('Migrating ledger...');
    const rows = ledger.map(l => ({
      record_id: l.recordId,
      timestamp: l.timestamp || new Date().toISOString(),
      sku_name: l.skuName,
      rack_id: l.rackId,
      qty_in: l.qtyIn,
      expired_date: l.expiredDate || null,
      sj_number: l.sjNumber,
      remarks: l.remarks,
      entitas: l.entitas,
    }));
    // Batch upsert in chunks of 500
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from('ledger').upsert(chunk, { onConflict: 'record_id' });
      if (error) console.error(`Ledger chunk ${i} error:`, error);
    }
    console.log('Ledger migrated successfully.');
  }

  // 4. Migrate Stock Opname
  if (opname.length > 0) {
    console.log('Migrating stock opname...');
    const rows = opname.map(o => ({
      rack_id: o.rackId,
      sku_name: o.skuName,
      qty_sistem: o.qtySistem,
      qty_fisik_soh: o.qtyFisikSOH,
      tanggal_opname: o.tanggalOpname || new Date().toISOString().slice(0, 10),
      petugas: o.petugas,
      catatan: o.catatan,
      entitas: 'BBB', // default
    }));
    const { error } = await supabase.from('stock_opname').upsert(rows, { onConflict: 'rack_id,sku_name,entitas' });
    if (error) console.error('Stock Opname migration error:', error);
    else console.log('Stock Opname migrated successfully.');
  }

  // 5. Migrate Rack Labels
  if (labels.length > 0) {
    console.log('Migrating rack labels...');
    const rows = labels.map(l => ({
      rack_id: l.rackId,
      sku_name: l.skuName,
      jenis_lokasi: l.jenisLokasi,
      barcode: l.barcode,
      qr_url: l.qrUrl,
      entitas: 'BBB',
    }));
    const { error } = await supabase.from('rack_labels').upsert(rows, { onConflict: 'rack_id,entitas' });
    if (error) console.error('Rack Labels migration error:', error);
    else console.log('Rack Labels migrated successfully.');
  }

  console.log('All migrations completed successfully!');
} catch (e) {
  console.error('Migration failed:', e);
}