import { supabaseAdmin } from './supabase';
import { calculateInventoryMetrics, CalculatorResult } from './inventory-calculator';
import { filterActiveSkus } from './warehouse-optimization';

// ============================================================================
// SUPABASE DATA LAYER
// ============================================================================
// This module is the single source of truth for all inventory data. It was
// migrated from Google Sheets (see scripts/migrate-to-supabase.mjs) and keeps
// the exact same exported API so that API routes and components need no change.
//
// Tables:
//   catalog            - SKU master data
//   physical_warehouse - Rack layout
//   ledger             - Transaction log (source of truth; +/- qty_in)
//   stock_opname       - Physical count (SOH)
//   rack_labels        - Label print references
//   picking_list       - Outbound picking headers
//   picking_list_items - Outbound picking rows
//   users              - Auth + roles
// ============================================================================

export type EntityFilter = 'BBB' | 'BBT' | 'ALL';

export interface CalculatorSummary {
  kritisCount: number;
  amanCount: number;
  overstockCount: number;
  totalInventoryValue: number;
  totalSaranOrderValue: number;
  topKritis: Array<{
    skuName: string;
    doi: string;
    coverageDays: string;
    entitas: string;
  }>;
}

// Legacy alias kept so imports such as `import { SHEETS } from '@/lib/google-sheets'`
// do not break. No longer used for actual reads/writes.
export const SHEETS = {
  CATALOG: 'catalog',
  WAREHOUSE: 'physical_warehouse',
  LEDGER: 'ledger',
  STOCK_OPNAME: 'stock_opname',
  RACK_LABELS: 'rack_labels',
  USERS: 'users',
  PICKING_LIST: 'picking_list',
  LEGACY_INVENTORY: 'catalog',
  LEGACY_INBOUND: 'ledger',
  LEGACY_DASHBOARD: 'catalog',
  LEGACY_MASTER: 'catalog',
} as const;

// ============================================================================
// HELPERS
// ============================================================================

function _str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function _num(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/** Parse a value to a number, falling back to `fallback` when null/undefined/NaN. */
function _numOr(v: unknown, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function _entity(v: unknown): 'BBB' | 'BBT' {
  const s = String(v || '').trim().toUpperCase();
  return s === 'BBT' ? 'BBT' : 'BBB';
}

/**
 * Normalize a DB date/timestamp value into a YYYY-MM-DD string.
 * Returns '' for null/invalid values so downstream formatting can show '-'.
 */
function toDateOnly(v: unknown): string {
  if (!v) return '';
  const s = String(v);
  // Already ISO date or timestamp — take the date portion.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Number of rows PostgREST returns per request. Supabase caps this at 1000 by
 * default, so we page through results for large tables (e.g. ledger).
 */
const PAGE_SIZE = 1000;

async function selectAll<T = any>(
  table: string,
  columns = '*',
  build?: (q: any) => any
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = supabaseAdmin.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (build) query = build(query);
    const { data, error } = await query;
    if (error) throw new Error(`[${table}] ${error.message}`);
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

// ============================================================================
// CATALOG (SKU Master Data)
// ============================================================================

export interface CatalogEntry {
  skuId: string;
  namaBarang: string;
  satuan: string;
  kategori: string;
  status: string;
  entitas: string;
  barcode: string;
  unitCost: number;
  leadTimeDays: number;
  safetyStockDays: number;
  activeFlag?: boolean;
}

export async function getCatalog(options?: { entity?: EntityFilter }): Promise<CatalogEntry[]> {
  const rows = await selectAll<any>('catalog', '*');
  return rows
    .filter(r => options?.entity === 'ALL' || r.entitas === options?.entity)
    .map((r) => ({
      skuId: _str(r.sku_id),
      namaBarang: _str(r.nama_barang),
      satuan: _str(r.satuan) || 'Pcs',
      kategori: _str(r.kategori) || 'General',
      status: _str(r.status) || 'Active',
      entitas: _entity(r.entitas),
      barcode: _str(r.barcode),
      unitCost: _num(r.unit_cost),
      leadTimeDays: _numOr(r.lead_time_days, 3),
      safetyStockDays: _numOr(r.safety_stock_days, 3),
      activeFlag: r.activeFlag ?? r.activeflag ?? true,
    }));
}

export async function getSKUNames(): Promise<string[]> {
  const catalog = await getCatalog();
  return catalog
    .filter((c) => c.status === 'Active')
    .map((c) => c.namaBarang)
    .sort();
}

export async function getSKUById(skuId: string): Promise<CatalogEntry | null> {
  const { data, error } = await supabaseAdmin
    .from('catalog')
    .select('*')
    .eq('sku_id', skuId)
    .maybeSingle();
  if (error) throw new Error(`[catalog] ${error.message}`);
  if (!data) return null;
  return {
    skuId: _str(data.sku_id),
    namaBarang: _str(data.nama_barang),
    satuan: _str(data.satuan) || 'Pcs',
    kategori: _str(data.kategori) || 'General',
    status: _str(data.status) || 'Active',
    entitas: _entity(data.entitas),
    barcode: _str(data.barcode),
    unitCost: _num(data.unit_cost),
    leadTimeDays: _numOr(data.lead_time_days, 3),
    safetyStockDays: _numOr(data.safety_stock_days, 3),
    activeFlag: data.activeFlag ?? data.activeflag ?? true,
  };
}

export async function getSKUByName(namaBarang: string): Promise<CatalogEntry | null> {
  const { data, error } = await supabaseAdmin
    .from('catalog')
    .select('*')
    .ilike('nama_barang', namaBarang)
    .maybeSingle();
  if (error) throw new Error(`[catalog] ${error.message}`);
  if (!data) return null;
  return {
    skuId: _str(data.sku_id),
    namaBarang: _str(data.nama_barang),
    satuan: _str(data.satuan) || 'Pcs',
    kategori: _str(data.kategori) || 'General',
    status: _str(data.status) || 'Active',
    entitas: _entity(data.entitas),
    barcode: _str(data.barcode),
    unitCost: _num(data.unit_cost),
    leadTimeDays: _numOr(data.lead_time_days, 3),
    safetyStockDays: _numOr(data.safety_stock_days, 3),
    activeFlag: data.activeFlag ?? data.activeflag ?? true,
  };
}

// ----------------------------------------------------------------------------
// CATALOG WRITE OPERATIONS (Master Data Management)
// ----------------------------------------------------------------------------

export interface CatalogInput {
  skuId: string;
  namaBarang: string;
  satuan: string;
  kategori: string;
  entitas: 'BBB' | 'BBT';
  barcode?: string;
  unitCost?: number;
  leadTimeDays?: number;
  safetyStockDays?: number;
  status?: string;
  activeFlag?: boolean;
}

/** Map a CatalogEntry/input into the snake_case DB row shape. */
function toCatalogRow(entry: Partial<CatalogInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entry.skuId !== undefined) row.sku_id = entry.skuId;
  if (entry.namaBarang !== undefined) row.nama_barang = entry.namaBarang;
  if (entry.satuan !== undefined) row.satuan = entry.satuan;
  if (entry.kategori !== undefined) row.kategori = entry.kategori;
  if (entry.entitas !== undefined) row.entitas = entry.entitas;
  if (entry.barcode !== undefined) row.barcode = entry.barcode;
  if (entry.unitCost !== undefined) row.unit_cost = entry.unitCost;
  if (entry.leadTimeDays !== undefined) row.lead_time_days = entry.leadTimeDays;
  if (entry.safetyStockDays !== undefined) row.safety_stock_days = entry.safetyStockDays;
  if (entry.status !== undefined) row.status = entry.status;
  if (entry.activeFlag !== undefined) row.activeflag = entry.activeFlag;
  return row;
}

export async function createCatalogEntry(entry: CatalogInput): Promise<CatalogEntry> {
  if (!entry.skuId || !entry.namaBarang) {
    throw new Error('SKU ID dan Nama Barang wajib diisi');
  }
  const row = {
    sku_id: entry.skuId,
    nama_barang: entry.namaBarang,
    satuan: entry.satuan || 'Pcs',
    kategori: entry.kategori || 'General',
    entitas: entry.entitas,
    barcode: entry.barcode || '',
    unit_cost: entry.unitCost ?? 0,
    lead_time_days: entry.leadTimeDays ?? 3,
    safety_stock_days: entry.safetyStockDays ?? 3,
    status: entry.status || 'Active',
    activeFlag: entry.activeFlag ?? true,
  };
  const { error } = await supabaseAdmin.from('catalog').insert(row);
  if (error) throw new Error(`[catalog] ${error.message}`);
  const created = await getSKUById(entry.skuId);
  if (!created) throw new Error('Gagal membuat SKU');
  return created;
}

export async function updateCatalogEntry(
  skuId: string,
  updates: Partial<Omit<CatalogInput, 'skuId'>>
): Promise<CatalogEntry> {
  const patch = toCatalogRow(updates);
  if (Object.keys(patch).length === 0) {
    throw new Error('Tidak ada perubahan untuk disimpan');
  }
  const { error } = await supabaseAdmin
    .from('catalog')
    .update(patch)
    .eq('sku_id', skuId);
  if (error) throw new Error(`[catalog] ${error.message}`);
  const updated = await getSKUById(skuId);
  if (!updated) throw new Error('SKU tidak ditemukan setelah pembaruan');
  return updated;
}

export async function deleteCatalogEntry(skuId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('catalog')
    .delete()
    .eq('sku_id', skuId);
  if (error) throw new Error(`[catalog] ${error.message}`);
}

// ----------------------------------------------------------------------------
// BULK OPERATIONS (Import / Export)
// ----------------------------------------------------------------------------

export interface BulkUpsertResult {
  created: number;
  updated: number;
  errors: Array<{ row: number; skuId: string; error: string }>;
}

/**
 * Bulk upsert catalog entries. Existing SKUs (matched by sku_id) are updated,
 * new SKUs are created. Falls back to per-row operations when the batched
 * upsert fails, so callers still get precise error reporting.
 */
export async function bulkUpsertCatalog(
  entries: CatalogInput[]
): Promise<BulkUpsertResult> {
  const result: BulkUpsertResult = { created: 0, updated: 0, errors: [] };
  if (entries.length === 0) return result;

  const skuIds = entries.map((e) => e.skuId);
  const existing = await supabaseAdmin
    .from('catalog')
    .select('sku_id')
    .in('sku_id', skuIds);
  const existingSet = new Set((existing.data || []).map((r) => r.sku_id));

  const rows = entries.map((entry) => ({
    sku_id: entry.skuId,
    nama_barang: entry.namaBarang,
    satuan: entry.satuan || 'Pcs',
    kategori: entry.kategori || 'General',
    entitas: entry.entitas,
    barcode: entry.barcode || '',
    unit_cost: entry.unitCost ?? 0,
    lead_time_days: entry.leadTimeDays ?? 3,
    safety_stock_days: entry.safetyStockDays ?? 3,
    status: entry.status || 'Active',
    activeflag: entry.activeFlag ?? true,
  }));

  const { error } = await supabaseAdmin
    .from('catalog')
    .upsert(rows, { onConflict: 'sku_id', ignoreDuplicates: false });

  if (error) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        if (existingSet.has(entry.skuId)) {
          await updateCatalogEntry(entry.skuId, entry);
          result.updated++;
        } else {
          await createCatalogEntry(entry);
          result.created++;
        }
      } catch (err) {
        result.errors.push({
          row: i + 1,
          skuId: entry.skuId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return result;
  }

  for (const entry of entries) {
    if (existingSet.has(entry.skuId)) result.updated++;
    else result.created++;
  }
  return result;
}

export async function seedUnitCost(): Promise<{ updated: number; errors: string[] }> {
  // Unit cost data extracted from the Excel files
  const unitCostData: Record<string, number> = {
    // BBB Entity
    'Apron': 50000,
    'Ayam Crispy': 37636,
    'BBQ Sauce': 14942.35,
    'BBQ Spicy': 15767.17,
    'BEEF SLICE': 31317.64,
    'Bangor Chicken Wings': 1682.80,
    'Bangor Crazy Bucket': 5000,
    'Bangor Fried Chicken': 74044.69,
    'Bangor Sticker 10Cm': 0,
    'Beef Large': 93119.87,
    'Bekas Burger': 0,
    'Bekas Kentang': 0,
    'Bekas Nasi': 0,
    'Bun Burger': 5000,
    'Bun Hotdog': 4500,
    'Cheese Sauce': 18000,
    'Chicken Burger': 8500,
    'Chicken Nugget': 12000,
    'Chili Sauce': 12000,
    'Coca Cola': 3500,
    'Coleslaw': 8000,
    'Cornetto': 4500,
    'Daging Asap': 45000,
    'Daging Giling': 35000,
    'Double Cheese': 15000,
    'Es Krim': 3000,
    'Fries': 8000,
    'Gorengan': 2000,
    'Hotdog': 7000,
    'Ice Tea': 2500,
    'Kentang Goreng': 8000,
    'Kopi': 2000,
    'Mayonaise': 15000,
    'Mie Goreng': 5000,
    'Mineral Water': 2000,
    'Nasi': 3000,
    'Nugget Ayam': 12000,
    'Oreo': 3000,
    'Patty Ayam': 8500,
    'Patty Beef': 12000,
    'Sambal': 8000,
    'Saus Sambal': 12000,
    'Saus Tomat': 10000,
    'Sayur': 2000,
    'Smoothies': 5000,
    'Sprite': 3500,
    'Teh Manis': 2000,
    'Topping': 5000,
    
    // BBT Entity
    'Bun': 4500,
    'Burger Patty': 12000,
    'Chicken Fillet': 18000,
    'Cheese Slice': 8000,
    'Lettuce': 3000,
    'Tomato': 4000,
    'Onion': 2500,
    'Pickles': 3500,
    'Burger Sauce': 15000,
    'Fries BBT': 7500,
    'Nuggets BBT': 11000,
    'Soda': 3000,
    'Water BBT': 2000,
    'Coffee BBT': 2500,
    'Tea BBT': 2000,
    'Ice Cream BBT': 4000,
    'Wrap': 6000,
    'Salad': 8000,
    'Soup': 7000,
    'Dessert': 5000,
    'Sauce BBT': 12000,
    'Breading': 4000,
    'Oil': 15000,
    'Packaging Box': 2000,
    'Packaging Bag': 1500,
    'Tissue': 1000,
    'Straw': 500,
    'Cup': 800,
    'Lid': 500,
  };

  let updated = 0;
  const errors: string[] = [];

  for (const [skuName, unitCost] of Object.entries(unitCostData)) {
    try {
      const { error } = await supabaseAdmin
        .from('catalog')
        .update({ unit_cost: unitCost })
        .ilike('nama_barang', skuName);
      
      if (error) {
        errors.push(`${skuName}: ${error.message}`);
      } else {
        updated++;
      }
    } catch (e) {
      errors.push(`${skuName}: ${e}`);
    }
  }

  return { updated, errors };
}

// ============================================================================
// WAREHOUSE (Physical Rack Layout)
// ============================================================================

export interface WarehouseRack {
  rackId: string;
  jenisLokasi: string;
  entitas: string;
  status: string;
}

export async function getWarehouse(): Promise<WarehouseRack[]> {
  const rows = await selectAll<any>('physical_warehouse', '*');
  return rows.map((r) => ({
    rackId: _str(r.rack_id),
    jenisLokasi: _str(r.jenis_lokasi) || 'RACKING',
    entitas: _entity(r.entitas),
    status: _str(r.status) || 'Active',
  }));
}

export async function getActiveRacks(): Promise<WarehouseRack[]> {
  const warehouse = await getWarehouse();
  return warehouse.filter((r) => r.status === 'Active');
}

export interface RackDetail {
  rackId: string;
  jenisLokasi: string;
  entitas: string;
  currentSku: string;
  currentQty: number;
  expiredDate: string;
  expiredLabel: string;
  daysToExpiry: number;
  skuBarcode: string;
}

export async function getRackDetail(rackId: string): Promise<RackDetail | null> {
  const [warehouse, ledger, catalog] = await Promise.all([
    getWarehouse(),
    getLedger(),
    getCatalog(),
  ]);

  const rack = warehouse.find((w) => w.rackId === rackId);
  if (!rack) return null;

  const rackEntries = ledger
    .filter((l) => l.rackId === rackId && l.qtyIn > 0)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const currentSku = rackEntries[0]?.skuName || '-';
  const totalQty = rackEntries.reduce((sum, l) => sum + l.qtyIn, 0);
  const latestExpiry = rackEntries[0]?.expiredDate || '';

  const skuEntry = catalog.find(
    (c) => c.namaBarang.toLowerCase() === currentSku.toLowerCase()
  );

  return {
    rackId,
    jenisLokasi: rack.jenisLokasi,
    entitas: rack.entitas,
    currentSku,
    currentQty: totalQty,
    expiredDate: latestExpiry,
    expiredLabel: formatDateShort(latestExpiry),
    daysToExpiry: calculateDaysToExpiry(latestExpiry),
    skuBarcode: skuEntry?.barcode || '',
  };
}

export function getZoneLabels(): Record<string, string> {
  return {
    RACKING: 'Zona Racking',
    FLOOR: 'Zona Floor',
    CONTAINER: 'Zona Container',
    FREEZER: 'Zona Freezer',
  };
}

export interface RackLabel {
  rackId: string;
  skuName: string;
  jenisLokasi: string;
  barcode: string;
  qrUrl: string;
}

export async function getRackLabels(): Promise<RackLabel[]> {
  const rows = await selectAll<any>('rack_labels', '*');
  return rows
    .map((r) => ({
      rackId: _str(r.rack_id),
      skuName: _str(r.sku_name) || '-',
      jenisLokasi: _str(r.jenis_lokasi) || 'RACKING',
      barcode: _str(r.barcode),
      qrUrl: _str(r.qr_url),
    }))
    .sort((a, b) => a.rackId.localeCompare(b.rackId));
}

// ============================================================================
// LEDGER (Transaction Log - Source of Truth)
// ============================================================================

export interface LedgerEntry {
  recordId: string;
  timestamp: string;
  skuName: string;
  rackId: string;
  qtyIn: number;
  expiredDate: string;
  sjNumber: string;
  remarks: string;
  entitas: 'BBB' | 'BBT';
}

export async function getLedger(): Promise<LedgerEntry[]> {
  const rows = await selectAll<any>('ledger', '*');
  return rows.map((r) => ({
    recordId: _str(r.record_id),
    timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : '',
    skuName: _str(r.sku_name),
    rackId: _str(r.rack_id),
    qtyIn: _num(r.qty_in),
    expiredDate: toDateOnly(r.expired_date),
    sjNumber: _str(r.sj_number),
    remarks: _str(r.remarks),
    entitas: _entity(r.entitas),
  }));
}

/**
 * Append a single ledger row. `qtyIn` is positive for inbound, negative for
 * outbound. Returns the generated record id.
 */
export async function appendLedgerEntry(entry: {
  recordId?: string;
  timestamp?: string;
  skuName: string;
  rackId: string;
  qtyIn: number;
  expiredDate?: string;
  sjNumber?: string;
  remarks?: string;
  entitas: 'BBB' | 'BBT';
}): Promise<string> {
  const recordId = entry.recordId || `REC-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { error } = await supabaseAdmin.from('ledger').insert({
    record_id: recordId,
    timestamp: entry.timestamp || new Date().toISOString(),
    sku_name: entry.skuName,
    rack_id: entry.rackId,
    qty_in: entry.qtyIn,
    expired_date: entry.expiredDate ? entry.expiredDate.slice(0, 10) : null,
    sj_number: entry.sjNumber || '',
    remarks: entry.remarks || '',
    entitas: entry.entitas,
  });
  if (error) throw new Error(`[ledger] ${error.message}`);
  return recordId;
}

// ============================================================================
// STOCK OPNAME (Physical Count / Cycle Count)
// ============================================================================

export interface StockOpnameEntry {
  rackId: string;
  skuName: string;
  qtySistem: number;
  qtyFisikSOH: number;
  variance: number;
  selisihRp: number;
  toleranceStatus: 'Akurat' | 'Toleransi' | 'Selisih';
  akurasi: string;
  tanggalOpname: string;
  petugas: string;
  catatan: string;
}

export async function getStockOpname(): Promise<StockOpnameEntry[]> {
  const rows = await selectAll<any>('stock_opname', '*');
  return rows.map((r) => ({
    rackId: _str(r.rack_id),
    skuName: _str(r.sku_name),
    qtySistem: _num(r.qty_sistem),
    qtyFisikSOH: _num(r.qty_fisik_soh),
    variance: _num(r.variance),
    selisihRp: _num(r.selisih_rp),
    toleranceStatus: (_str(r.tolerance_status) || 'Akurat') as 'Akurat' | 'Toleransi' | 'Selisih',
    akurasi: `${_num(r.akurasi_pct).toFixed(2)}%`,
    tanggalOpname: toDateOnly(r.tanggal_opname),
    petugas: _str(r.petugas),
    catatan: _str(r.catatan),
  }));
}

export async function updateStockOpnameSOH(
  rackId: string,
  skuName: string,
  qtyFisikSOH: number,
  petugas: string = '',
  catatan: string = ''
): Promise<void> {
  // Determine the entity from the warehouse rack.
  const { data: rack } = await supabaseAdmin
    .from('physical_warehouse')
    .select('entitas')
    .eq('rack_id', rackId)
    .maybeSingle();
  const entitas = _entity(rack?.entitas);

  // Current system qty for this rack+sku (sum of ledger).
  const { data: ledgerRows, error: lErr } = await supabaseAdmin
    .from('ledger')
    .select('qty_in')
    .eq('rack_id', rackId)
    .ilike('sku_name', skuName);
  if (lErr) throw new Error(`[ledger] ${lErr.message}`);
  const qtySistem = (ledgerRows || []).reduce((sum, r) => sum + _num(r.qty_in), 0);

  // Calculate variance
  const variance = qtyFisikSOH - qtySistem;
  
  // Calculate accuracy
  const akurasiPct = qtySistem > 0 ? (qtyFisikSOH / qtySistem) * 100 : 100;
  
  // Get unit cost from catalog
  const sku = await getSKUByName(skuName);
  const unitCost = sku?.unitCost || 0;
  
  // Calculate Rupiah variance
  const selisihRp = variance * unitCost;
  
  // Determine tolerance status
  const absVariance = Math.abs(variance);
  const accuracyDiff = 100 - akurasiPct;
  let toleranceStatus: 'Akurat' | 'Toleransi' | 'Selisih';
  if (absVariance === 0) {
    toleranceStatus = 'Akurat';
  } else if (absVariance <= 1 || accuracyDiff <= 1.0) {
    toleranceStatus = 'Toleransi';
  } else {
    toleranceStatus = 'Selisih';
  }

  const { error } = await supabaseAdmin.from('stock_opname').upsert(
    {
      rack_id: rackId,
      sku_name: skuName,
      qty_sistem: qtySistem,
      qty_fisik_soh: qtyFisikSOH,
      variance,
      selisih_rp: selisihRp,
      tolerance_status: toleranceStatus,
      akurasi_pct: Math.round(akurasiPct * 100) / 100,
      tanggal_opname: new Date().toISOString().slice(0, 10),
      petugas,
      catatan,
      entitas,
    },
    { onConflict: 'rack_id,sku_name,entitas' }
  );
  if (error) throw new Error(`[stock_opname] ${error.message}`);
}

export async function syncStockOpnameWithSystem(): Promise<void> {
  const [ledger, opname] = await Promise.all([getLedger(), getStockOpname()]);

  const systemMap = new Map<string, number>();
  for (const l of ledger) {
    const key = `${l.rackId}|${l.skuName.toLowerCase()}`;
    systemMap.set(key, (systemMap.get(key) || 0) + l.qtyIn);
  }

  for (const o of opname) {
    const key = `${o.rackId}|${o.skuName.toLowerCase()}`;
    const newSistem = systemMap.get(key) || 0;
    if (newSistem === o.qtySistem) continue;

    const { error } = await supabaseAdmin
      .from('stock_opname')
      .update({ qty_sistem: newSistem })
      .eq('rack_id', o.rackId)
      .ilike('sku_name', o.skuName);
    if (error) throw new Error(`[stock_opname] ${error.message}`);
  }
}

// ============================================================================
// INVENTORY COMPUTATION (Calculated from Ledger + Warehouse + Catalog)
// ============================================================================

export interface InventoryLot {
  nomorRak: string;
  namaBarang: string;
  qtySistem: number;
  tanggalInbound: string;
  tanggalExpired: string;
  expiredLabel: string;
  daysToExpiry: number;
  soh: number;
  variance: number;
  akurasi: number;
  statusFefo: string;
  urutanFefo: number;
  stockPicking: number;
  barcode: string;
  category: string;
  unit: string;
  skuId: string;
  jenisLokasi: string;
  entitas: string;
}

function formatDateShort(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function calculateDaysToExpiry(expiredDate: string): number {
  if (!expiredDate) return 9999;
  const expDate = new Date(expiredDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((expDate.getTime() - today.getTime()) / 86400000);
}

function calculateFEFOStatus(daysToExpiry: number, qtySistem: number): string {
  if (qtySistem <= 0) return 'HABIS';
  if (daysToExpiry < 0) return 'EXPIRED';
  if (daysToExpiry === 0) return 'EXPIRED HARI INI';
  return 'OK';
}

export async function getInventoryLots(): Promise<InventoryLot[]> {
  const [ledger, allCatalog, warehouse, opname] = await Promise.all([
    getLedger(),
    getCatalog(),
    getWarehouse(),
    getStockOpname(),
  ]);
  const catalog = filterActiveSkus(allCatalog);

  const catalogByName = new Map(catalog.map((c) => [c.namaBarang.toLowerCase(), c]));
  const warehouseByRack = new Map(warehouse.map((w) => [w.rackId, w]));

  const opnameMap = new Map<string, StockOpnameEntry>();
  for (const o of opname) {
    opnameMap.set(`${o.rackId}|${o.skuName.toLowerCase()}`, o);
  }

  // Aggregate ledger by (SKU + Rack + Expiry) for FEFO batches.
  const lotMap = new Map<
    string,
    { qtyIn: number; timestamps: string[]; expiryDates: string[]; sjNumbers: string[] }
  >();

  for (const entry of ledger) {
    const key = `${entry.skuName.toLowerCase()}|${entry.rackId}|${entry.expiredDate}`;
    if (!lotMap.has(key)) {
      lotMap.set(key, { qtyIn: 0, timestamps: [], expiryDates: [], sjNumbers: [] });
    }
    const lot = lotMap.get(key)!;
    lot.qtyIn += entry.qtyIn;
    lot.timestamps.push(entry.timestamp);
    lot.expiryDates.push(entry.expiredDate);
    lot.sjNumbers.push(entry.sjNumber);
  }

  const lots: InventoryLot[] = [];

  const rackSkuMap = new Map<string, string>();
  for (const entry of ledger) {
    if (!rackSkuMap.has(entry.rackId) || entry.qtyIn > 0) {
      rackSkuMap.set(entry.rackId, entry.skuName);
    }
  }

  for (const rack of warehouse) {
    const skuName = rackSkuMap.get(rack.rackId);
    const catalogEntry = skuName ? catalogByName.get(skuName.toLowerCase()) : null;

    const lotEntries = Array.from(lotMap.entries())
      .filter(([key]) => key.startsWith(`${(skuName || '').toLowerCase()}|${rack.rackId}|`))
      .map(([, value]) => value);

    if (lotEntries.length === 0 && !skuName) {
      lots.push({
        nomorRak: rack.rackId,
        namaBarang: '-',
        qtySistem: 0,
        tanggalInbound: '-',
        tanggalExpired: '-',
        expiredLabel: '-',
        daysToExpiry: 9999,
        soh: 0,
        variance: 0,
        akurasi: 100,
        statusFefo: 'OK',
        urutanFefo: 0,
        stockPicking: 0,
        barcode: '',
        category: '',
        unit: 'Pcs',
        skuId: '',
        jenisLokasi: rack.jenisLokasi,
        entitas: rack.entitas,
      });
    } else if (lotEntries.length > 0) {
      for (const lot of lotEntries) {
        const latestTimestamp = [...lot.timestamps].sort().reverse()[0] || '-';
        const earliestExpiry = [...lot.expiryDates].filter(Boolean).sort()[0] || '';

        const opnameEntry = opnameMap.get(`${rack.rackId}|${(skuName || '').toLowerCase()}`);
        const soh = opnameEntry?.qtyFisikSOH || 0;
        const variance = soh - lot.qtyIn;
        const akurasi = lot.qtyIn > 0 ? (soh / lot.qtyIn) * 100 : 100;

        lots.push({
          nomorRak: rack.rackId,
          namaBarang: skuName || '-',
          qtySistem: lot.qtyIn,
          tanggalInbound: latestTimestamp,
          tanggalExpired: earliestExpiry,
          expiredLabel: formatDateShort(earliestExpiry),
          daysToExpiry: calculateDaysToExpiry(earliestExpiry),
          soh,
          variance,
          akurasi: Math.round(akurasi * 100) / 100,
          statusFefo: calculateFEFOStatus(calculateDaysToExpiry(earliestExpiry), lot.qtyIn),
          urutanFefo: 0,
          stockPicking: 0,
          barcode: catalogEntry?.barcode || '',
          category: catalogEntry?.kategori || '',
          unit: catalogEntry?.satuan || 'Pcs',
          skuId: catalogEntry?.skuId || '',
          jenisLokasi: rack.jenisLokasi,
          entitas: rack.entitas,
        });
      }
    }
  }

  return lots.sort((a, b) => {
    if (a.qtySistem > 0 && b.qtySistem === 0) return -1;
    if (a.qtySistem === 0 && b.qtySistem > 0) return 1;
    if (a.qtySistem > 0 && b.qtySistem > 0) return a.daysToExpiry - b.daysToExpiry;
    return a.nomorRak.localeCompare(b.nomorRak);
  });
}

// ============================================================================
// DASHBOARD AGGREGATIONS
// ============================================================================

export async function getFullDashboard(entity?: EntityFilter) {
  const [lots, warehouse, catalog] = await Promise.all([
    getInventoryLots(),
    getWarehouse(),
    getCatalog(),
  ]);

  const entityWarehouse =
    entity && entity !== 'ALL' ? warehouse.filter((w) => w.entitas === entity) : warehouse;

  const entityCatalog =
    entity && entity !== 'ALL' ? catalog.filter((c) => c.entitas === entity) : catalog;

  const entityWarehouseIds = new Set(entityWarehouse.map((w) => w.rackId));
  const entityCatalogNames = new Set(entityCatalog.map((c) => c.namaBarang.toLowerCase()));

  const filteredLots = lots.filter(
    (l) =>
      entityWarehouseIds.has(l.nomorRak) &&
      (l.namaBarang === '-' || entityCatalogNames.has(l.namaBarang.toLowerCase()))
  );

  const activeLots = filteredLots.filter((l) => l.qtySistem > 0);

  const expiredLots = activeLots.filter(
    (l) => l.statusFefo === 'EXPIRED' || l.statusFefo === 'EXPIRED HARI INI'
  );
  const expiringSoon = activeLots.filter(
    (l) => l.daysToExpiry >= 0 && l.daysToExpiry <= 30 && l.statusFefo !== 'HABIS'
  );

  const zoneMap: Record<string, number> = {};
  for (const lot of activeLots) {
    const zone = lot.jenisLokasi || 'Unknown';
    zoneMap[zone] = (zoneMap[zone] || 0) + lot.qtySistem;
  }
  const zoneLabels = getZoneLabels();
  const zoneDistribution = Object.entries(zoneMap)
    .map(([zone, qty]) => ({ zone: zoneLabels[zone] || zone, qty }))
    .sort((a, b) => b.qty - a.qty);

  const skuTotals: Record<string, number> = {};
  for (const lot of activeLots) {
    skuTotals[lot.namaBarang] = (skuTotals[lot.namaBarang] || 0) + lot.qtySistem;
  }
  const topSkus = Object.entries(skuTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([namaBarang, qty]) => ({ namaBarang, qty }));

  const entityRackIds = new Set(entityWarehouse.map((w) => w.rackId));
  const emptyRacks = filteredLots.filter(
    (l) => l.qtySistem === 0 && entityRackIds.has(l.nomorRak)
  ).length;

  const entityLotsWithOpname = filteredLots.filter(
    (l) => (l.qtySistem > 0 || l.soh > 0) && entityRackIds.has(l.nomorRak)
  );
  const totalVariance = entityLotsWithOpname.reduce((sum, l) => sum + l.variance, 0);
  const avgAccuracy =
    entityLotsWithOpname.length > 0
      ? entityLotsWithOpname.reduce((sum, l) => sum + l.akurasi, 0) /
        entityLotsWithOpname.length
      : 100;

  return {
    entity: entity || 'ALL',
    summary: {
      totalSKU: entityCatalogNames.size,
      totalSystemQty: activeLots.reduce((sum, l) => sum + l.qtySistem, 0),
      totalSOH: activeLots.reduce((sum, l) => sum + l.soh, 0),
      variance: Math.round(totalVariance),
      accuracy: Math.round(avgAccuracy * 100) / 100,
      expiredCount: expiredLots.length,
      expiringCount: expiringSoon.length,
      outOfStockCount: emptyRacks,
      emptySlots: emptyRacks,
    },
    alerts: {
      expired: expiredLots.slice(0, 10).map((l) => ({
        namaBarang: l.namaBarang,
        nomorRak: l.nomorRak,
        qty: l.qtySistem,
        expiredDate: l.expiredLabel,
        entitas: l.entitas,
      })),
      expiring: expiringSoon.slice(0, 10).map((l) => ({
        namaBarang: l.namaBarang,
        nomorRak: l.nomorRak,
        qty: l.qtySistem,
        expiredDate: l.expiredLabel,
        daysLeft: l.daysToExpiry,
        entitas: l.entitas,
      })),
      outOfStock: filteredLots
        .filter((l) => l.qtySistem === 0 && l.namaBarang !== '-' && entityRackIds.has(l.nomorRak))
        .slice(0, 10)
        .map((l) => ({ namaBarang: l.namaBarang, entitas: l.entitas })),
    },
    charts: {
      topSkus: topSkus.map((s) => ({ ...s, entitas: entity || 'ALL' })),
      zoneDistribution: zoneDistribution.map((z) => ({ ...z, entitas: entity || 'ALL' })),
    },
    inventory: filteredLots,
    calculatorSummary: await getCalculatorSummary(entity),
  };
}

export async function getFefoLots(limit = 50, entity?: EntityFilter) {
  const lots = await getInventoryLots();
  return lots
    .filter((l) => l.qtySistem > 0 && (!entity || entity === 'ALL' || l.entitas === entity))
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry)
    .slice(0, limit)
    .map((l) => ({
      namaBarang: l.namaBarang,
      nomorRak: l.nomorRak,
      qtySistem: l.qtySistem,
      daysToExpiry: l.daysToExpiry,
      expiredLabel: l.expiredLabel,
      statusFefo: l.statusFefo,
      category: l.category,
      entitas: l.entitas,
    }));
}

// ============================================================================
// WAREHOUSE HEALTH CHECK
// ============================================================================

export async function getWarehouseHealth() {
  const [ledger, catalog, warehouse, lots] = await Promise.all([
    getLedger(),
    getCatalog(),
    getWarehouse(),
    getInventoryLots(),
  ]);

  const activeRacks = warehouse.filter((w) => w.status === 'Active');
  const totalMasterRacks = activeRacks.length;
  const activeSkus = catalog.filter((c) => c.status === 'Active').length;

  const racksWithStock = new Set(ledger.filter((l) => l.qtyIn > 0).map((l) => l.rackId));
  const synced = activeRacks.filter((r) => racksWithStock.has(r.rackId)).length;

  return {
    totalMasterRacks,
    inventoryRows: lots.length,
    uniqueMasterSkus: activeSkus,
    synced,
    coverage: totalMasterRacks ? Math.round((synced / totalMasterRacks) * 100) : 100,
    issues: 0,
    emptyRacks: totalMasterRacks - racksWithStock.size,
    racksWithStock: racksWithStock.size,
    missingInInventory: [],
    skuMismatch: [],
    orphanRacks: [],
  };
}

// ============================================================================
// CALCULATOR SUMMARY (Dashboard KPIs & KRITIS Alerts)
// ============================================================================

/**
 * Fetches inventory data and computes calculator-based summary for dashboard.
 * Includes KRITIS/AMAN/OVERSTOCK counts, inventory value, reorder value, and top KRITIS SKUs.
 */
export async function getCalculatorSummary(entity?: EntityFilter): Promise<CalculatorSummary> {
  const [lots, catalog, ledger] = await Promise.all([
    getInventoryLots(),
    getCatalog(),
    getLedger(),
  ]);

  const entityFilter = entity || 'ALL';
  const results = calculateInventoryMetrics({ lots, catalog, ledger, entity: entityFilter });

  const kritisItems = results.filter((r) => r.status === 'KRITIS');
  const amanItems = results.filter((r) => r.status === 'AMAN');
  const overstockItems = results.filter((r) => r.status === 'OVERSTOCK');

  const totalInventoryValue = results.reduce((sum, r) => sum + r.inventoryValue, 0);
  const totalSaranOrderValue = results.reduce((sum, r) => sum + r.saranOrderQty * r.unitCost, 0);

  const topKritis = kritisItems
    .sort((a, b) => a.coverageDays - b.coverageDays)
    .slice(0, 10)
    .map((r) => ({
      skuName: r.skuName,
      doi: r.doi === Infinity ? '∞' : r.doi.toFixed(1),
      coverageDays: r.coverageDays.toFixed(1),
      entitas: r.entitas,
    }));

  return {
    kritisCount: kritisItems.length,
    amanCount: amanItems.length,
    overstockCount: overstockItems.length,
    totalInventoryValue,
    totalSaranOrderValue,
    topKritis,
  };
}

// ============================================================================
// STOCK BY SKU (for stock tables)
// ============================================================================

export async function getStockBySku(search?: string) {
  const lots = await getInventoryLots();
  const catalog = await getCatalog();
  const catalogByName = new Map(catalog.map((c) => [c.namaBarang.toLowerCase(), c]));

  let activeLots = lots.filter((l) => l.qtySistem > 0);
  if (search) {
    const term = search.toLowerCase();
    activeLots = activeLots.filter(
      (l) =>
        l.namaBarang.toLowerCase().includes(term) || l.nomorRak.toLowerCase().includes(term)
    );
  }

  const skuMap: Record<string, any> = {};

  for (const lot of activeLots) {
    const key = lot.namaBarang.toLowerCase();
    if (!skuMap[key]) {
      const masterEntry = catalogByName.get(key);
      skuMap[key] = {
        namaBarang: lot.namaBarang,
        category: masterEntry?.kategori || '',
        barcode: masterEntry?.barcode || '',
        unit: masterEntry?.satuan || 'Pcs',
        totalQtySystem: 0,
        totalSoh: 0,
        rackCount: 0,
        earliestExpiry: '9999-12-31',
        earliestExpiryDate: '-',
        statusFefo: 'OK',
        racks: [],
        moreRacks: 0,
      };
    }
    const entry = skuMap[key];
    entry.totalQtySystem += lot.qtySistem;
    entry.totalSoh += lot.soh;
    entry.rackCount++;
    entry.racks.push(lot.nomorRak);

    if (lot.tanggalExpired && lot.tanggalExpired < entry.earliestExpiry) {
      entry.earliestExpiry = lot.tanggalExpired;
      entry.earliestExpiryDate = formatDateShort(lot.tanggalExpired);
    }

    const statusOrder = { EXPIRED: 4, 'EXPIRED HARI INI': 3, HABIS: 2, OK: 1 };
    if (
      (statusOrder[lot.statusFefo as keyof typeof statusOrder] || 0) >
      (statusOrder[entry.statusFefo as keyof typeof statusOrder] || 0)
    ) {
      entry.statusFefo = lot.statusFefo;
    }
  }

  return Object.values(skuMap)
    .map((s: any) => ({
      ...s,
      moreRacks: Math.max(0, s.racks.length - 3),
      racks: s.racks.slice(0, 3),
    }))
    .sort((a, b) => a.namaBarang.localeCompare(b.namaBarang));
}

export async function getStockDetail(search: string = '', entity?: EntityFilter) {
  const [lots, warehouse] = await Promise.all([getInventoryLots(), getWarehouse()]);

  const filteredWarehouse =
    entity && entity !== 'ALL' ? warehouse.filter((w) => w.entitas === entity) : warehouse;
  const entityRackIds = new Set(filteredWarehouse.map((w) => w.rackId));

  return lots
    .filter(
      (l) =>
        entityRackIds.has(l.nomorRak) &&
        (!search ||
          l.namaBarang.toLowerCase().includes(search.toLowerCase()) ||
          l.nomorRak.toLowerCase().includes(search.toLowerCase()))
    )
    .map((l) => ({
      nomorRak: l.nomorRak,
      namaBarang: l.namaBarang,
      qtySistem: l.qtySistem,
      soh: l.soh,
      variance: l.variance,
      akurasi: l.akurasi,
      statusFefo: l.statusFefo,
      urutanFefo: l.urutanFefo,
      stockPicking: l.stockPicking,
      tanggalInbound: l.tanggalInbound,
      tanggalExpired: l.tanggalExpired,
      expiredLabel: l.expiredLabel,
      daysToExpiry: l.daysToExpiry,
      barcode: l.barcode,
      category: l.category,
      unit: l.unit,
      entitas: l.entitas,
    }))
    .sort(
      (a, b) =>
        a.namaBarang.localeCompare(b.namaBarang) || a.nomorRak.localeCompare(b.nomorRak)
    );
}

// ============================================================================
// INBOUND SUBMISSION (Writes to Ledger)
// ============================================================================

export async function submitInbound(data: {
  entitas: 'BBB' | 'BBT';
  barcode: string;
  namaBarang: string;
  totalQty: number;
  tanggalInbound: string;
  tanggalKadaluarsa: string;
  nomorSJ: string;
  rack1?: string; qtyRack1?: number;
  rack2?: string; qtyRack2?: number;
  rack3?: string; qtyRack3?: number;
  rack4?: string; qtyRack4?: number;
  rack5?: string; qtyRack5?: number;
  rack6?: string; qtyRack6?: number;
  remarks: string;
}) {
  const sku = await getSKUByName(data.namaBarang);
  if (!sku) {
    throw new Error(`SKU "${data.namaBarang}" tidak ditemukan di Catalog.`);
  }
  if (sku.entitas !== data.entitas) {
    throw new Error(
      `SKU "${data.namaBarang}" milik entitas ${sku.entitas}, tidak sesuai dengan entitas inbound ${data.entitas}.`
    );
  }

  const warehouse = await getWarehouse();
  const entityWarehouse = warehouse.filter((w) => w.entitas === data.entitas);
  const validRacks = new Set(entityWarehouse.map((w) => w.rackId));
  const racks = [
    { rack: data.rack1, qty: data.qtyRack1 || 0 },
    { rack: data.rack2, qty: data.qtyRack2 || 0 },
    { rack: data.rack3, qty: data.qtyRack3 || 0 },
    { rack: data.rack4, qty: data.qtyRack4 || 0 },
    { rack: data.rack5, qty: data.qtyRack5 || 0 },
    { rack: data.rack6, qty: data.qtyRack6 || 0 },
  ];

  for (const { rack, qty } of racks) {
    if (rack && qty > 0 && !validRacks.has(rack)) {
      throw new Error(
        `Rack "${rack}" tidak ditemukan atau tidak milik entitas ${data.entitas} di Physical_Warehouse.`
      );
    }
  }

  let written = 0;
  const timestamp = data.tanggalInbound || new Date().toISOString();
  for (const { rack, qty } of racks) {
    if (!rack || qty === 0) continue;

    await appendLedgerEntry({
      recordId: `REC-${Date.now()}-${written}`,
      timestamp,
      skuName: data.namaBarang,
      rackId: rack,
      qtyIn: qty,
      expiredDate: data.tanggalKadaluarsa,
      sjNumber: data.nomorSJ || '',
      remarks: data.remarks || '',
      entitas: data.entitas,
    });
    written++;
  }

  return {
    success: true,
    message: `Data inbound berhasil disimpan (${written} alokasi rack).`,
  };
}

// ============================================================================
// PICKING LIST (Outbound)
// ============================================================================

export interface PickingListRow {
  pickingListNo: string;
  roNumber: string;
  customer: string;
  branch: string;
  roDate: string;
  rackId: string;
  skuName: string;
  qtyPick: number;
  expiredDate: string;
  zone: string;
  sequence: number;
  entitas: string;
  status: string;
  timestamp: string;
}

/**
 * Creates a picking list + its items in a single operation.
 */
export async function createPickingList(header: {
  pickingListNo: string;
  roNumber: string;
  customer: string;
  branch: string;
  roDate: string;
  entitas: 'BBB' | 'BBT';
  allocations: Array<{
    rackId: string;
    skuName: string;
    qtyAllocated: number;
    expiredDate: string;
    zone: string;
    sequence: number;
  }>;
}): Promise<void> {
  const { data: pl, error: plErr } = await supabaseAdmin
    .from('picking_list')
    .insert({
      picking_list_no: header.pickingListNo,
      status: 'PENDING',
      entitas: header.entitas,
    })
    .select('id')
    .single();
  if (plErr) throw new Error(`[picking_list] ${plErr.message}`);

  const items = header.allocations.map((a) => ({
    picking_list_id: pl.id,
    sku_name: a.skuName,
    qty_requested: a.qtyAllocated,
    qty_allocated: a.qtyAllocated,
    qty_picked: 0,
    rack_id: a.rackId,
    expired_date: a.expiredDate ? a.expiredDate.slice(0, 10) : null,
    status: 'PENDING',
  }));

  const { error: itemsErr } = await supabaseAdmin.from('picking_list_items').insert(items);
  if (itemsErr) throw new Error(`[picking_list_items] ${itemsErr.message}`);
}

/**
 * Reads picking-list rows for Excel export, shaped like the legacy
 * Picking_List sheet (each allocation = one row).
 */
export async function getPickingListRows(pickingListNo?: string): Promise<PickingListRow[]> {
  let headerQuery = supabaseAdmin.from('picking_list').select('id, picking_list_no, entitas, created_at');
  if (pickingListNo) headerQuery = headerQuery.eq('picking_list_no', pickingListNo);

  const { data: headers, error: hErr } = await headerQuery;
  if (hErr) throw new Error(`[picking_list] ${hErr.message}`);
  if (!headers || headers.length === 0) return [];

  const headerIds = headers.map((h: any) => h.id);
  const { data: items, error: iErr } = await supabaseAdmin
    .from('picking_list_items')
    .select('*')
    .in('picking_list_id', headerIds)
    .order('rack_id', { ascending: true });
  if (iErr) throw new Error(`[picking_list_items] ${iErr.message}`);

  const headerMap = new Map(headers.map((h: any) => [h.id, h]));
  const rows: PickingListRow[] = (items || []).map((it: any, idx: number) => {
    const h = headerMap.get(it.picking_list_id) as any;
    return {
      pickingListNo: _str(h?.picking_list_no),
      roNumber: '',
      customer: '',
      branch: '',
      roDate: toDateOnly(h?.created_at),
      rackId: _str(it.rack_id),
      skuName: _str(it.sku_name),
      qtyPick: _num(it.qty_allocated),
      expiredDate: toDateOnly(it.expired_date),
      zone: '',
      sequence: idx + 1,
      entitas: _entity(h?.entitas),
      status: _str(it.status),
      timestamp: _str(h?.created_at),
    };
  });

  return rows;
}

// ============================================================================
// BACKWARD COMPATIBILITY & HELPER FUNCTIONS
// ============================================================================

export interface MasterSkuEntry {
  skuName: string;
  category: string;
  unit: string;
  barcode: string;
  locationType: string;
}

export interface MasterRackEntry {
  rack: string;
  skuName: string;
  qty: number;
  locationType: string;
}

export interface MasterMap {
  bySku: Record<string, MasterSkuEntry>;
  racks: MasterRackEntry[];
}

export async function getMasterMap(): Promise<MasterMap> {
  const [catalog, warehouse, ledger] = await Promise.all([
    getCatalog(),
    getWarehouse(),
    getLedger(),
  ]);

  const bySku: Record<string, MasterSkuEntry> = {};
  for (const c of catalog) {
    if (c.status === 'Active') {
      bySku[c.namaBarang.toLowerCase()] = {
        skuName: c.namaBarang,
        category: c.kategori,
        unit: c.satuan,
        barcode: c.barcode || '',
        locationType: '',
      };
    }
  }

  const rackStock = new Map<string, number>();
  for (const l of ledger) {
    rackStock.set(l.rackId, (rackStock.get(l.rackId) || 0) + l.qtyIn);
  }

  const racks: MasterRackEntry[] = [];
  for (const w of warehouse) {
    if (w.status === 'Active') {
      const ledgerEntry = ledger.find((l) => l.rackId === w.rackId && l.qtyIn > 0);
      racks.push({
        rack: w.rackId,
        skuName: ledgerEntry?.skuName || '',
        qty: rackStock.get(w.rackId) || 0,
        locationType: w.jenisLokasi,
      });
    }
  }

  return { bySku, racks };
}

export async function getRackDetailsBySKU(
  skuName: string
): Promise<{ rack: string; qtySistem: number }[]> {
  const [ledger, warehouse] = await Promise.all([getLedger(), getWarehouse()]);

  const key = skuName.toLowerCase();
  const rackStock = new Map<string, number>();

  for (const l of ledger) {
    if (l.skuName.toLowerCase() === key) {
      rackStock.set(l.rackId, (rackStock.get(l.rackId) || 0) + l.qtyIn);
    }
  }

  const seen = new Set<string>();
  const uniqueRacks = warehouse
    .filter((w) => w.status === 'Active')
    .map((w) => w.rackId)
    .filter((r) => r && !seen.has(r) && seen.add(r))
    .sort();

  return uniqueRacks.map((rack) => ({
    rack,
    qtySistem: rackStock.get(rack) || 0,
  }));
}
