import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';

// ============================================================================
// NEW ARCHITECTURE SHEET NAMES
// ============================================================================
export const SHEETS = {
  CATALOG: 'Catalog',
  WAREHOUSE: 'Physical_Warehouse',
  LEDGER: 'Ledger',
  STOCK_OPNAME: 'Stock_Opname',
  RACK_LABELS: 'Rack_Labels',
  USERS: 'Users',
  // Legacy sheets kept for backward compatibility (read-only)
  LEGACY_INVENTORY: 'Inventory',
  LEGACY_INBOUND: 'Inbound',
  LEGACY_DASHBOARD: 'Dasboard',
  LEGACY_MASTER: 'Master Data',
} as const;

let sheetsClient: sheets_v4.Sheets | null = null;

export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (sheetsClient) return sheetsClient;

  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

export async function readSheet(sheetName: string, range?: string): Promise<string[][]> {
  const client = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range: range || sheetName,
  });
  return res.data.values || [];
}

export async function appendRow(sheetName: string, values: (string | number)[]): Promise<void> {
  const client = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  await client.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

export async function updateRange(sheetName: string, range: string, values: (string | number)[][]): Promise<void> {
  const client = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${range}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
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
}

export async function getCatalog(): Promise<CatalogEntry[]> {
  const rows = await readSheet(SHEETS.CATALOG);
  if (rows.length <= 1) return [];
  
  // Header: SKU_ID, Nama Barang, Satuan, Kategori, Status, Entitas, Barcode
  return rows.slice(1)
    .filter(r => r[0] && r[1])
    .map((r, i) => ({
      skuId: String(r[0] || `SKU-${String(i + 1).padStart(3, '0')}`).trim(),
      namaBarang: String(r[1] || '').trim(),
      satuan: String(r[2] || 'Pcs').trim(),
      kategori: String(r[3] || 'General').trim(),
      status: String(r[4] || 'Active').trim(),
      entitas: String(r[5] || 'BBB').trim(), // Default to BBB for backward compat
      barcode: String(r[6] || '').trim(),
    }));
}

export async function getSKUNames(): Promise<string[]> {
  const catalog = await getCatalog();
  return catalog.filter(c => c.status === 'Active').map(c => c.namaBarang).sort();
}

export async function getSKUById(skuId: string): Promise<CatalogEntry | null> {
  const catalog = await getCatalog();
  return catalog.find(c => c.skuId === skuId) || null;
}

export async function getSKUByName(namaBarang: string): Promise<CatalogEntry | null> {
  const catalog = await getCatalog();
  return catalog.find(c => c.namaBarang.toLowerCase() === namaBarang.toLowerCase()) || null;
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
  const rows = await readSheet(SHEETS.WAREHOUSE);
  if (rows.length <= 1) return [];
  
  // Header: Rack_ID, Jenis Lokasi, Entitas, Status
  return rows.slice(1)
    .filter(r => r[0])
    .map(r => ({
      rackId: String(r[0] || '').trim(),
      jenisLokasi: String(r[1] || 'RACKING').trim(),
      entitas: String(r[2] || 'Default').trim(),
      status: String(r[3] || 'Active').trim(),
    }));
}

export async function getActiveRacks(): Promise<WarehouseRack[]> {
  const warehouse = await getWarehouse();
  return warehouse.filter(r => r.status === 'Active');
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

  const rack = warehouse.find(w => w.rackId === rackId);
  if (!rack) return null;

  // Find latest ledger entries for this rack
  const rackEntries = ledger
    .filter(l => l.rackId === rackId && l.qtyIn > 0)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const currentSku = rackEntries[0]?.skuName || '-';
  const totalQty = rackEntries.reduce((sum, l) => sum + l.qtyIn, 0);
  const latestExpiry = rackEntries[0]?.expiredDate || '';
  
  const skuEntry = catalog.find(c => c.namaBarang.toLowerCase() === currentSku.toLowerCase());

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
    'RACKING': 'Zona Racking',
    'FLOOR': 'Zona Floor',
    'CONTAINER': 'Zona Container',
    'FREEZER': 'Zona Freezer',
  };
}

export interface RackLabel {
  rackId: string;
  skuName: string;
  jenisLokasi: string;
  barcode: string;
  qrUrl: string;
}

/**
 * Reads the Rack_Labels sheet (the label reference). The sheet is laid out as a
 * two-column print grid: left half A:F, right half I:N. Each row holds up to two
 * label records.
 */
export async function getRackLabels(): Promise<RackLabel[]> {
  const rows = await readSheet(SHEETS.RACK_LABELS, `${SHEETS.RACK_LABELS}!A2:N400`);
  const labels: RackLabel[] = [];

  for (const row of rows) {
    // Left label: A=Pallet, B=SKU, C=Zone, D=Barcode, E=QR Url
    if (row[0] && String(row[0]).trim()) {
      labels.push({
        rackId: String(row[0]).trim(),
        skuName: String(row[1] || '-').trim(),
        jenisLokasi: String(row[2] || 'RACKING').trim(),
        barcode: String(row[3] || '').trim(),
        qrUrl: String(row[4] || '').trim(),
      });
    }
    // Right label: I=Pallet, J=SKU, K=Zone, L=Barcode, M=QR Url
    if (row[8] && String(row[8]).trim()) {
      labels.push({
        rackId: String(row[8]).trim(),
        skuName: String(row[9] || '-').trim(),
        jenisLokasi: String(row[10] || 'RACKING').trim(),
        barcode: String(row[11] || '').trim(),
        qrUrl: String(row[12] || '').trim(),
      });
    }
  }

  return labels.sort((a, b) => a.rackId.localeCompare(b.rackId));
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
  entitas: 'BBB' | 'BBT';  // New column for entity
}

export async function getLedger(): Promise<LedgerEntry[]> {
  const rows = await readSheet(SHEETS.LEDGER);
  if (rows.length <= 1) return [];
  
  // Header: Record_ID, Timestamp, SKU_Name, Rack_ID, Qty_In, Expired_Date, SJ_Number, Remarks, Entitas
  return rows.slice(1)
    .filter(r => r[0] && r[2] && r[3])
    .map(r => ({
      recordId: String(r[0] || '').trim(),
      timestamp: String(r[1] || '').trim(),
      skuName: String(r[2] || '').trim(),
      rackId: String(r[3] || '').trim(),
      qtyIn: parseFloat(String(r[4] || '0')) || 0,
      expiredDate: String(r[5] || '').trim(),
      sjNumber: String(r[6] || '').trim(),
      remarks: String(r[7] || '').trim(),
      entitas: (String(r[8] || '').trim() as 'BBB' | 'BBT') || 'BBB',  // Default to BBB for old rows
    }));
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
  akurasi: string;
  tanggalOpname: string;
  petugas: string;
  catatan: string;
}

export async function getStockOpname(): Promise<StockOpnameEntry[]> {
  const rows = await readSheet(SHEETS.STOCK_OPNAME);
  if (rows.length <= 1) return [];
  
  // Header: Rack_ID, SKU_Name, Qty_Sistem, Qty_Fisik_SOH, Variance, Akurasi_%, Tanggal_Opname, Petugas, Catatan
  return rows.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => ({
      rackId: String(r[0] || '').trim(),
      skuName: String(r[1] || '').trim(),
      qtySistem: parseFloat(String(r[2] || '0')) || 0,
      qtyFisikSOH: parseFloat(String(r[3] || '0')) || 0,
      variance: parseFloat(String(r[4] || '0')) || 0,
      akurasi: String(r[5] || '100.00%').trim(),
      tanggalOpname: String(r[6] || '').trim(),
      petugas: String(r[7] || '').trim(),
      catatan: String(r[8] || '').trim(),
    }));
}

export async function updateStockOpnameSOH(rackId: string, skuName: string, qtyFisikSOH: number, petugas: string = '', catatan: string = ''): Promise<void> {
  const client = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  // Read current opname to find the row
  const rows = await readSheet(SHEETS.STOCK_OPNAME);
  if (rows.length <= 1) return;

  const rowIndex = rows.findIndex((r, i) => 
    i > 0 && String(r[0] || '').trim() === rackId && String(r[1] || '').trim().toLowerCase() === skuName.toLowerCase()
  );

  if (rowIndex === -1) {
    // Not found - append new row
    const qtySistem = 0; // Will be recalculated
    const variance = qtyFisikSOH - qtySistem;
    const akurasi = qtySistem > 0 ? ((qtyFisikSOH / qtySistem) * 100).toFixed(2) + '%' : '100.00%';
    const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    
    await appendRow(SHEETS.STOCK_OPNAME, [
      rackId, skuName, qtySistem, qtyFisikSOH, variance, akurasi, today, petugas, catatan
    ]);
  } else {
    // Update existing row (rowIndex is 0-based, sheet row is 1-based + header)
    const sheetRow = rowIndex + 1;
    const currentSistem = parseFloat(String(rows[rowIndex][2] || '0')) || 0;
    const variance = qtyFisikSOH - currentSistem;
    const akurasi = currentSistem > 0 ? ((qtyFisikSOH / currentSistem) * 100).toFixed(2) + '%' : '100.00%';
    const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    
    // Update columns D (Qty_Fisik_SOH), E (Variance), F (Akurasi), G (Tanggal), H (Petugas), I (Catatan)
    await client.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `${SHEETS.STOCK_OPNAME}!D${sheetRow}`, values: [[qtyFisikSOH]] },
          { range: `${SHEETS.STOCK_OPNAME}!E${sheetRow}`, values: [[variance]] },
          { range: `${SHEETS.STOCK_OPNAME}!F${sheetRow}`, values: [[akurasi]] },
          { range: `${SHEETS.STOCK_OPNAME}!G${sheetRow}`, values: [[today]] },
          { range: `${SHEETS.STOCK_OPNAME}!H${sheetRow}`, values: [[petugas]] },
          { range: `${SHEETS.STOCK_OPNAME}!I${sheetRow}`, values: [[catatan]] },
        ],
      },
    });
  }
}

export async function syncStockOpnameWithSystem(): Promise<void> {
  // Recalculate Qty_Sistem for all opname rows from Ledger
  const [ledger, opname] = await Promise.all([getLedger(), getStockOpname()]);
  
  // Aggregate ledger by rack+sku
  const systemMap = new Map<string, number>();
  for (const l of ledger) {
    const key = `${l.rackId}|${l.skuName.toLowerCase()}`;
    systemMap.set(key, (systemMap.get(key) || 0) + l.qtyIn);
  }

  const client = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  const rows = await readSheet(SHEETS.STOCK_OPNAME);
  if (rows.length <= 1) return;

  const updates = [];
  
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rackId = String(r[0] || '').trim();
    const skuName = String(r[1] || '').trim();
    if (!rackId || !skuName) continue;
    
    const key = `${rackId}|${skuName.toLowerCase()}`;
    const newSistem = systemMap.get(key) || 0;
    const currentSistem = parseFloat(String(r[2] || '0')) || 0;
    const fisik = parseFloat(String(r[3] || '0')) || 0;
    
    if (newSistem !== currentSistem) {
      const variance = fisik - newSistem;
      const akurasi = newSistem > 0 ? ((fisik / newSistem) * 100).toFixed(2) + '%' : '100.00%';
      const sheetRow = i + 1;
      
      updates.push(
        { range: `${SHEETS.STOCK_OPNAME}!C${sheetRow}`, values: [[newSistem]] },
        { range: `${SHEETS.STOCK_OPNAME}!E${sheetRow}`, values: [[variance]] },
        { range: `${SHEETS.STOCK_OPNAME}!F${sheetRow}`, values: [[akurasi]] }
      );
    }
  }

  if (updates.length > 0) {
    await client.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    });
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
  const [ledger, catalog, warehouse, opname] = await Promise.all([
    getLedger(),
    getCatalog(),
    getWarehouse(),
    getStockOpname(),
  ]);

  // Build lookup maps
  const catalogByName = new Map(catalog.map(c => [c.namaBarang.toLowerCase(), c]));
  const catalogById = new Map(catalog.map(c => [c.skuId, c]));
  const warehouseByRack = new Map(warehouse.map(w => [w.rackId, w]));
  
  // Build Stock Opname lookup: key = "RACK|SKU"
  const opnameMap = new Map<string, StockOpnameEntry>();
  for (const o of opname) {
    const key = `${o.rackId}|${o.skuName.toLowerCase()}`;
    opnameMap.set(key, o);
  }

  // Aggregate ledger by (SKU + Rack + Expiry) - FEFO grouping
  const lotMap = new Map<string, {
    qtyIn: number;
    timestamps: string[];
    expiryDates: string[];
    sjNumbers: string[];
  }>();

  for (const entry of ledger) {
    const key = `${entry.skuName.toLowerCase()}|${entry.rackId}|${entry.expiredDate}`;
    if (!lotMap.has(key)) {
      lotMap.set(key, {
        qtyIn: 0,
        timestamps: [],
        expiryDates: [],
        sjNumbers: [],
      });
    }
    const lot = lotMap.get(key)!;
    lot.qtyIn += entry.qtyIn;
    lot.timestamps.push(entry.timestamp);
    lot.expiryDates.push(entry.expiredDate);
    lot.sjNumbers.push(entry.sjNumber);
  }

  // Build inventory lots from aggregated ledger + warehouse
  const lots: InventoryLot[] = [];

  // Ensure ALL racks from warehouse are represented (even empty ones)
  const rackSkuMap = new Map<string, string>(); // rack -> skuName from ledger
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
      // Empty rack - still show in inventory
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
      // Has transactions - create lots per expiry batch (FEFO)
      for (const lot of lotEntries) {
        const latestTimestamp = lot.timestamps.sort().reverse()[0] || '-';
        const earliestExpiry = lot.expiryDates.sort()[0] || '-';
        
        // Look up Stock Opname for this rack+sku
        const opnameKey = `${rack.rackId}|${(skuName || '').toLowerCase()}`;
        const opnameEntry = opnameMap.get(opnameKey);
        const soh = opnameEntry?.qtyFisikSOH || 0;
        const variance = soh - lot.qtyIn;
        const akurasi = lot.qtyIn > 0 ? ((soh / lot.qtyIn) * 100) : 100;
        
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

  // Sort: Active stock first (by expiry), then empty racks
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

export type EntityFilter = 'BBB' | 'BBT' | 'ALL';

export async function getFullDashboard(entity?: EntityFilter) {
  const [lots, warehouse, catalog] = await Promise.all([
    getInventoryLots(),
    getWarehouse(),
    getCatalog(),
  ]);

  // Filter by entity if specified
  const entityWarehouse = entity && entity !== 'ALL'
    ? warehouse.filter(w => w.entitas === entity)
    : warehouse;

  const entityCatalog = entity && entity !== 'ALL'
    ? catalog.filter(c => c.entitas === entity)
    : catalog;

  const entityWarehouseIds = new Set(entityWarehouse.map(w => w.rackId));
  const entityCatalogNames = new Set(entityCatalog.map(c => c.namaBarang.toLowerCase()));

  // Filter lots by entity
  const filteredLots = lots.filter(l => 
    entityWarehouseIds.has(l.nomorRak) && 
    (l.namaBarang === '-' || entityCatalogNames.has(l.namaBarang.toLowerCase()))
  );

  const activeLots = filteredLots.filter(l => l.qtySistem > 0);
  const skusWithStock = new Set(activeLots.map(l => l.namaBarang).filter(Boolean));
  const totalSKU = skusWithStock.size;

  const totalSystemQty = activeLots.reduce((sum, l) => sum + l.qtySistem, 0);
  const totalSOH = activeLots.reduce((sum, l) => sum + l.soh, 0);

  // Expired/Expiring
  const expiredLots = activeLots.filter(l => l.statusFefo === 'EXPIRED' || l.statusFefo === 'EXPIRED HARI INI');
  const expiringSoon = activeLots.filter(l => l.daysToExpiry >= 0 && l.daysToExpiry <= 30 && l.statusFefo !== 'HABIS');

  // Zone distribution from Warehouse
  const zoneMap: Record<string, number> = {};
  for (const lot of activeLots) {
    const zone = lot.jenisLokasi || 'Unknown';
    zoneMap[zone] = (zoneMap[zone] || 0) + lot.qtySistem;
  }
  const zoneLabels = getZoneLabels();
  const zoneDistribution = Object.entries(zoneMap)
    .map(([zone, qty]) => ({ zone: zoneLabels[zone] || zone, qty }))
    .sort((a, b) => b.qty - a.qty);

  // Top SKUs
  const skuTotals: Record<string, number> = {};
  for (const lot of activeLots) {
    skuTotals[lot.namaBarang] = (skuTotals[lot.namaBarang] || 0) + lot.qtySistem;
  }
  const topSkus = Object.entries(skuTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([namaBarang, qty]) => ({ namaBarang, qty }));

  // Empty racks (only for this entity)
  const entityRackIds = new Set(entityWarehouse.map(w => w.rackId));
  const emptyRacks = filteredLots.filter(l => l.qtySistem === 0 && entityRackIds.has(l.nomorRak)).length;

  // Calculate real variance and accuracy from Stock Opname (entity filtered)
  const entityLotsWithOpname = filteredLots.filter(l => (l.qtySistem > 0 || l.soh > 0) && entityRackIds.has(l.nomorRak));
  const totalVariance = entityLotsWithOpname.reduce((sum, l) => sum + l.variance, 0);
  const avgAccuracy = entityLotsWithOpname.length > 0 
    ? entityLotsWithOpname.reduce((sum, l) => sum + l.akurasi, 0) / entityLotsWithOpname.length 
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
      expired: expiredLots.slice(0, 10).map(l => ({
        namaBarang: l.namaBarang,
        nomorRak: l.nomorRak,
        qty: l.qtySistem,
        expiredDate: l.expiredLabel,
        entitas: l.entitas,
      })),
      expiring: expiringSoon.slice(0, 10).map(l => ({
        namaBarang: l.namaBarang,
        nomorRak: l.nomorRak,
        qty: l.qtySistem,
        expiredDate: l.expiredLabel,
        daysLeft: l.daysToExpiry,
        entitas: l.entitas,
      })),
      outOfStock: filteredLots.filter(l => l.qtySistem === 0 && l.namaBarang !== '-' && entityRackIds.has(l.nomorRak)).slice(0, 10).map(l => ({ namaBarang: l.namaBarang, entitas: l.entitas })),
    },
    charts: {
      topSkus: topSkus.map(s => ({ ...s, entitas: entity || 'ALL' })),
      zoneDistribution: zoneDistribution.map(z => ({ ...z, entitas: entity || 'ALL' })),
    },
    inventory: filteredLots,
  };
}

export async function getFefoLots(limit = 50, entity?: EntityFilter) {
  const lots = await getInventoryLots();
  return lots
    .filter(l => l.qtySistem > 0 && (!entity || entity === 'ALL' || l.entitas === entity))
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry)
    .slice(0, limit)
    .map(l => ({
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

  const activeRacks = warehouse.filter(w => w.status === 'Active');
  const totalMasterRacks = activeRacks.length;
  const activeSkus = catalog.filter(c => c.status === 'Active').length;

  // Racks with stock from ledger
  const racksWithStock = new Set(ledger.filter(l => l.qtyIn > 0).map(l => l.rackId));
  const synced = activeRacks.filter(r => racksWithStock.has(r.rackId)).length;

  // SKUs used in ledger vs catalog
  const usedSkus = new Set(ledger.map(l => l.skuName.toLowerCase()));
  const catalogSkus = new Set(catalog.filter(c => c.status === 'Active').map(c => c.namaBarang.toLowerCase()));

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
// STOCK BY SKU (for stock tables)
// ============================================================================

export async function getStockBySku(search?: string) {
  const lots = await getInventoryLots();
  const catalog = await getCatalog();
  const catalogByName = new Map(catalog.map(c => [c.namaBarang.toLowerCase(), c]));

  const activeLots = lots.filter(l => l.qtySistem > 0);
  if (search) {
    const term = search.toLowerCase();
    activeLots.filter(l => l.namaBarang.toLowerCase().includes(term) || l.nomorRak.toLowerCase().includes(term));
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

    const statusOrder = { 'EXPIRED': 4, 'EXPIRED HARI INI': 3, 'HABIS': 2, 'OK': 1 };
    if ((statusOrder[lot.statusFefo as keyof typeof statusOrder] || 0) > (statusOrder[entry.statusFefo as keyof typeof statusOrder] || 0)) {
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
  const [lots, warehouse] = await Promise.all([
    getInventoryLots(),
    getWarehouse(),
  ]);

  const filteredWarehouse = entity && entity !== 'ALL'
    ? warehouse.filter(w => w.entitas === entity)
    : warehouse;
  const entityRackIds = new Set(filteredWarehouse.map(w => w.rackId));

  return lots
    .filter(l => 
      entityRackIds.has(l.nomorRak) &&
      (!search || l.namaBarang.toLowerCase().includes(search.toLowerCase()) || l.nomorRak.toLowerCase().includes(search.toLowerCase()))
    )
    .map(l => ({
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
    .sort((a, b) => a.namaBarang.localeCompare(b.namaBarang) || a.nomorRak.localeCompare(b.nomorRak));
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
  // Validate SKU exists in catalog and belongs to the entity
  const sku = await getSKUByName(data.namaBarang);
  if (!sku) {
    throw new Error(`SKU "${data.namaBarang}" tidak ditemukan di Catalog.`);
  }
  if (sku.entitas !== data.entitas) {
    throw new Error(`SKU "${data.namaBarang}" milik entitas ${sku.entitas}, tidak sesuai dengan entitas inbound ${data.entitas}.`);
  }

  // Validate racks exist in warehouse and belong to the entity
  const warehouse = await getWarehouse();
  const entityWarehouse = warehouse.filter(w => w.entitas === data.entitas);
  const validRacks = new Set(entityWarehouse.map(w => w.rackId));
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
      throw new Error(`Rack "${rack}" tidak ditemukan atau tidak milik entitas ${data.entitas} di Physical_Warehouse.`);
    }
  }

  // Write each rack allocation as separate ledger entry
  let written = 0;
  for (const { rack, qty } of racks) {
    if (!rack || qty === 0) continue;

    const recordId = `REC-${Date.now()}-${written}`;
    await appendRow(SHEETS.LEDGER, [
      recordId,
      new Date().toISOString(),
      data.namaBarang,
      rack,
      qty,
      data.tanggalKadaluarsa,
      data.nomorSJ || '',
      data.remarks || '',
      data.entitas,  // Add entitas column
    ]);
    written++;
  }

  return { success: true, message: `Data inbound berhasil disimpan (${written} alokasi rack).` };
}

// ============================================================================
// BACKWARD COMPATIBILITY & HELPER FUNCTIONS
// ============================================================================

// Legacy MasterMap interface for backward compatibility
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
  // Build from new architecture for backward compatibility
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
        barcode: '',
        locationType: '',
      };
    }
  }

  // Build rack entries from warehouse + ledger stock
  const rackStock = new Map<string, number>();
  for (const l of ledger) {
    rackStock.set(l.rackId, (rackStock.get(l.rackId) || 0) + l.qtyIn);
  }

  const racks: MasterRackEntry[] = [];
  for (const w of warehouse) {
    if (w.status === 'Active') {
      // Find which SKU is in this rack from ledger
      const ledgerEntry = ledger.find(l => l.rackId === w.rackId && l.qtyIn > 0);
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

export async function getRackDetailsBySKU(skuName: string): Promise<{ rack: string; qtySistem: number }[]> {
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
    .filter(w => w.status === 'Active')
    .map(w => w.rackId)
    .filter(r => r && !seen.has(r) && seen.add(r))
    .sort();

  return uniqueRacks.map(rack => ({
    rack,
    qtySistem: rackStock.get(rack) || 0,
  }));
}

function _str(v: any): string {
  return v === null || v === undefined ? '' : String(v);
}

function _num(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}