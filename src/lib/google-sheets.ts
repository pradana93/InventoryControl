import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';

// Sheet names matching the original workbook
export const SHEETS = {
  DASHBOARD: 'Dasboard',
  INVENTORY: 'Inventory',
  MASTER: 'Master Data',
  INBOUND: 'Inbound',
  OUTBOUND: 'Outbound',
  OUTB_REQ: 'Outbound Request',
  PICKING: 'Picking List',
  USERS: 'Users',
} as const;

// Inventory sheet layout (1-indexed, header row = 3, data starts row 4)
const INV_HEADER_ROW = 3;
const INV_FIRST_ROW = 4;

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
//  MASTER DATA HELPERS
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
  const sh = await readSheet(SHEETS.MASTER);
  // Header row 3, data from row 4
  const data = sh.slice(3);
  const bySku: Record<string, MasterSkuEntry> = {};
  const racks: MasterRackEntry[] = [];

  for (const row of data) {
    if (!row[0] || !row[1]) continue; // Nomor Rak or NAMA BARANG empty

    const rack = String(row[0] || '').trim();
    const rackSku = String(row[1] || '').trim();
    const qty = parseFloat(String(row[2] || '0')) || 0;
    const locationType = String(row[3] || '').trim();
    const category = String(row[5] || '').trim(); // Column F
    const catalogSku = String(row[6] || '').trim(); // Column G
    const unit = String(row[7] || '').trim(); // Column H
    const barcode = String(row[8] || '').trim(); // Column I

    // Index by both catalogSku (Col G) and rackSku (Col B) so lookup never misses
    const primarySku = catalogSku || rackSku;
    if (primarySku && !bySku[primarySku.toLowerCase()]) {
      bySku[primarySku.toLowerCase()] = {
        skuName: primarySku,
        category,
        unit,
        barcode,
        locationType,
      };
    }
    if (rackSku && !bySku[rackSku.toLowerCase()]) {
      bySku[rackSku.toLowerCase()] = {
        skuName: rackSku,
        category,
        unit,
        barcode,
        locationType,
      };
    }

    if (rack) {
      racks.push({ rack, skuName: rackSku, qty, locationType });
    }
  }

  return { bySku, racks };
}

export async function getSKUNames(): Promise<string[]> {
  const master = await getMasterMap();
  return Object.keys(master.bySku)
    .map((k) => master.bySku[k].skuName)
    .sort();
}

export async function getRackDetailsBySKU(skuName: string): Promise<{ rack: string; qtySistem: number }[]> {
  const [master, inventory] = await Promise.all([
    getMasterMap(),
    getInventoryLots(),
  ]);

  const key = (skuName || '').toLowerCase();
  const skuStock: Record<string, number> = {};

  for (const lot of inventory) {
    if (lot.namaBarang?.toLowerCase() === key) {
      skuStock[lot.nomorRak] = (skuStock[lot.nomorRak] || 0) + lot.qtySistem;
    }
  }

  const seen = new Set<string>();
  const uniqueRacks = master.racks
    .map((r) => r.rack)
    .filter((r) => r && !seen.has(r) && seen.add(r))
    .sort();

  return uniqueRacks.map((rack) => ({
    rack,
    qtySistem: skuStock[rack] || 0,
  }));
}

// ============================================================================
//  INVENTORY LOTS (FEFO logic)
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
}

async function getInventoryLots(): Promise<InventoryLot[]> {
  const [inventoryRows, masterMap] = await Promise.all([
    readSheet(SHEETS.INVENTORY),
    getMasterMap(),
  ]);

  // Inventory: header row 3, data from row 4
  // Actual columns:
  // 0: Nama Barang (SKU Name)
  // 1: Nomor Rak (Rack Code)
  // 2: Kuantitas Sistem
  // 3: Tanggal Inbound
  // 4: Tanggal Kadaluarsa
  // 5: Stok Aktual (SOH)
  // 6: Variance
  // 7: Akurasi Stock
  // 8: Status FEFO
  // 9: Urutan FEFO
  // 10: Kunci FEFO
  // 11: Stock Picking
  const data = inventoryRows.slice(3);
  const lots: InventoryLot[] = [];

  for (const row of data) {
    // FIXED: Column A = Nama Barang (SKU), Column B = Nomor Rak (Rack)
    const namaBarang = String(row[0] || '').trim();
    const nomorRak = String(row[1] || '').trim();
    const qtySistem = parseFloat(String(row[2] || '0')) || 0;
    const tanggalInbound = String(row[3] || '').trim();
    const tanggalExpired = String(row[4] || '').trim();
    const soh = parseFloat(String(row[5] || '0')) || 0;
    const variance = parseFloat(String(row[6] || '0')) || 0;
    const akurasi = parseFloat(String(row[7] || '0')) || 0;
    const statusFefo = String(row[8] || '').trim();
    const urutanFefo = parseInt(String(row[9] || '0'), 10) || 0;
    const stockPicking = parseFloat(String(row[10] || '0')) || 0;
    // Inventory sheet doesn't have barcode/category/unit - get from Master Data
    const masterEntry = masterMap.bySku[namaBarang.toLowerCase()];
    const barcode = masterEntry?.barcode || '';
    const category = masterEntry?.category || '';
    const unit = masterEntry?.unit || '';

    if (!nomorRak || !namaBarang) continue;

    // Calculate days to expiry
    let daysToExpiry = 0;
    if (tanggalExpired) {
      const expDate = new Date(tanggalExpired + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysToExpiry = Math.round((expDate.getTime() - today.getTime()) / 86400000);
    }

    const expiredLabel = formatDateShort(tanggalExpired);

    lots.push({
      nomorRak,
      namaBarang,
      qtySistem,
      tanggalInbound,
      tanggalExpired,
      expiredLabel,
      daysToExpiry,
      soh,
      variance,
      akurasi,
      statusFefo,
      urutanFefo,
      stockPicking,
      barcode,
      category,
      unit,
    });
  }

  return lots;
}

function formatDateShort(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export async function getFullDashboard() {
  const [lots, master, dashboardSummary] = await Promise.all([
    getInventoryLots(),
    getMasterMap(),
    getDashboardSummary(),
  ]);

  // Unique SKU names present in inventory with stock > 0
  const skusWithStock = new Set(lots.filter(l => l.qtySistem > 0).map(l => l.namaBarang).filter(Boolean));
  const totalSKU = skusWithStock.size;

  // Total system qty (all rows)
  const totalSystemQty = lots.reduce((sum, l) => sum + l.qtySistem, 0);

  // Total SOH (only rows that have been opname'd)
  const totalSOH = lots.reduce((sum, l) => sum + l.soh, 0);

  // Summary figures from Dasboard sheet (pre-computed by spreadsheet formulas)
  const variance = dashboardSummary.totalVariance;
  const accuracy = dashboardSummary.accuracy;
  const outOfStockCount = dashboardSummary.outOfStockCount;

  // Expired lots (per FEFO status) — qty still on hand
  const expiredLots = lots.filter(
    (l) => (l.statusFefo === 'EXPIRED' || l.statusFefo === 'EXPIRED HARI INI') && l.qtySistem > 0
  );
  const expiringSoon = lots.filter(
    (l) => l.daysToExpiry >= 0 && l.daysToExpiry <= 30 && l.qtySistem > 0 && l.statusFefo !== 'HABIS'
  );

  // Empty slots: Master Data racks that have 0 system qty
  const racksWithStock = new Set(lots.filter((l) => l.qtySistem > 0).map((l) => l.nomorRak));
  const emptySlots = master.racks.filter((r) => r.qty === 0 && !racksWithStock.has(r.rack)).length;

  // Top 10 SKU by system qty
  const skuTotals: Record<string, number> = {};
  for (const lot of lots) {
    skuTotals[lot.namaBarang] = (skuTotals[lot.namaBarang] || 0) + lot.qtySistem;
  }
  const topSkus = Object.entries(skuTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([namaBarang, qty]) => ({ namaBarang, qty }));

  // Zone distribution — use Master Data's Jenis Lokasi (RACKING, FLOOR, CONTAINER, FREEZER)
  const zoneMap: Record<string, number> = {};
  for (const lot of lots) {
    if (lot.nomorRak) {
      const masterRack = master.racks.find(r => r.rack === lot.nomorRak);
      const zone = masterRack?.locationType || lot.nomorRak.replace(/[^A-Za-z].*$/, '') || 'Unknown';
      zoneMap[zone] = (zoneMap[zone] || 0) + lot.qtySistem;
    }
  }
  const zoneLabels: Record<string, string> = {
    'RACKING': 'Zona Racking',
    'FLOOR': 'Zona Floor',
    'CONTAINER': 'Zona Container',
    'FREEZER': 'Zona Freezer',
  };
  const zoneDistribution = Object.entries(zoneMap)
    .map(([zone, qty]) => ({ zone: zoneLabels[zone] || zone, qty }))
    .sort((a, b) => b.qty - a.qty);

  return {
    summary: {
      totalSKU,
      totalSystemQty,
      totalSOH,
      variance,
      accuracy,
      expiredCount: expiredLots.length,
      expiringCount: expiringSoon.length,
      outOfStockCount,
      emptySlots,
    },
    alerts: {
      expired: expiredLots.slice(0, 10).map((l) => ({
        namaBarang: l.namaBarang,
        nomorRak: l.nomorRak,
        qty: l.qtySistem,
        expiredDate: l.expiredLabel,
      })),
      expiring: expiringSoon.slice(0, 10).map((l) => ({
        namaBarang: l.namaBarang,
        nomorRak: l.nomorRak,
        qty: l.qtySistem,
        expiredDate: l.expiredLabel,
        daysLeft: l.daysToExpiry,
      })),
      outOfStock: lots.filter((l) => l.statusFefo === 'HABIS').slice(0, 10).map((l) => l.namaBarang),
    },
    charts: {
      topSkus,
      zoneDistribution,
    },
    inventory: lots,
  };
}

/**
 * Lightweight lot feed for the FEFO timeline widget.
 * Returns only lots that still hold stock, sorted by nearest expiry.
 */
export async function getFefoLots(limit = 50) {
  const lots = await getInventoryLots();
  return lots
    .filter((l) => l.qtySistem > 0)
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
    }));
}

// ============================================================================
//  DASHBOARD SHEET SUMMARY (pre-computed by spreadsheet formulas)
// ============================================================================

interface DashboardSummary {
  totalSKU: number;
  totalSystemQty: number;
  totalSOH: number;
  totalVariance: number;
  accuracy: number;
  expiredCount: number;
  expiredTodayCount: number;
  outOfStockCount: number;
}

async function getDashboardSummary(): Promise<DashboardSummary> {
  const rows = await readSheet(SHEETS.DASHBOARD);

  const num = (v: string | undefined): number => {
    if (!v) return 0;
    // Handle Indonesian formats: "100,00%" -> 100, "1.234,5" -> 1234.5
    const cleaned = String(v).trim().replace('%', '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  };

  const find = (label: string): string | undefined => {
    const row = rows.find((r) => String(r[0] || '').toLowerCase().includes(label.toLowerCase()));
    return row?.[1];
  };

  const accuracyRaw = find('Rata-rata Akurasi');
  const expiredCount = num(find('Lot Expired'));
  const expiredTodayCount = num(find('Lot Expired Hari Ini'));

  return {
    totalSKU: num(find('Total SKU')),
    totalSystemQty: num(find('Total Kuantitas Sistem')),
    totalSOH: num(find('Total Stok Aktual')),
    totalVariance: num(find('Total Variance')),
    accuracy: num(accuracyRaw),
    expiredCount: expiredCount + expiredTodayCount,
    expiredTodayCount,
    outOfStockCount: num(find('Lot stok habis')),
  };
}

export async function getStockBySku(search?: string) {
  const lots = await getInventoryLots();
  const master = await getMasterMap();

  // Group by SKU
  const skuMap: Record<string, {
    namaBarang: string;
    category: string;
    barcode: string;
    unit: string;
    totalQtySystem: number;
    totalSoh: number;
    rackCount: number;
    earliestExpiry: string;
    earliestExpiryDate: string;
    statusFefo: string;
    racks: string[];
    moreRacks: number;
  }> = {};

  for (const lot of lots) {
    if (search && !lot.namaBarang.toLowerCase().includes(search.toLowerCase())) continue;

    const key = lot.namaBarang.toLowerCase();
    if (!skuMap[key]) {
      const masterEntry = master.bySku[key];
      skuMap[key] = {
        namaBarang: lot.namaBarang,
        category: masterEntry?.category || '',
        barcode: masterEntry?.barcode || lot.barcode,
        unit: masterEntry?.unit || lot.unit,
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

    // Worst status wins
    const statusOrder = { 'EXPIRED': 4, 'EXPIRED HARI INI': 3, 'HABIS': 2, 'OK': 1 };
    if ((statusOrder[lot.statusFefo as keyof typeof statusOrder] || 0) > (statusOrder[entry.statusFefo as keyof typeof statusOrder] || 0)) {
      entry.statusFefo = lot.statusFefo;
    }
  }

  return Object.values(skuMap)
    .map((s) => ({
      ...s,
      moreRacks: Math.max(0, s.racks.length - 3),
      racks: s.racks.slice(0, 3),
    }))
    .sort((a, b) => a.namaBarang.localeCompare(b.namaBarang));
}

export async function getStockDetail(search?: string) {
  const lots = await getInventoryLots();
  return lots
    .filter((l) => !search || l.namaBarang.toLowerCase().includes(search.toLowerCase()) || l.nomorRak.toLowerCase().includes(search.toLowerCase()))
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
    }))
    .sort((a, b) => a.namaBarang.localeCompare(b.namaBarang) || a.nomorRak.localeCompare(b.nomorRak));
}

export async function submitInbound(data: {
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
  const row = [
    data.barcode || '',
    data.namaBarang,
    data.totalQty,
    data.tanggalInbound,
    data.tanggalKadaluarsa,
    data.nomorSJ || '',
    data.rack1 || '', data.qtyRack1 || 0,
    data.rack2 || '', data.qtyRack2 || 0,
    data.rack3 || '', data.qtyRack3 || 0,
    data.rack4 || '', data.qtyRack4 || 0,
    data.rack5 || '', data.qtyRack5 || 0,
    data.rack6 || '', data.qtyRack6 || 0,
    data.remarks || '',
  ];

  await appendRow(SHEETS.INBOUND, row);
  
  // Also sync to Inventory sheet (keep Master Data aligned)
  await syncInboundToInventory(data);
  
  return { success: true, message: 'Data inbound berhasil disimpan dan disinkronkan ke Inventory.' };
}

async function syncInboundToInventory(data: {
  namaBarang: string;
  totalQty: number;
  tanggalInbound: string;
  tanggalKadaluarsa: string;
  rack1?: string; qtyRack1?: number;
  rack2?: string; qtyRack2?: number;
  rack3?: string; qtyRack3?: number;
  rack4?: string; qtyRack4?: number;
  rack5?: string; qtyRack5?: number;
  rack6?: string; qtyRack6?: number;
}) {
  const client = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  // Read current Inventory to find existing rows
  const invRows = await readSheet(SHEETS.INVENTORY);
  const headerIdx = invRows.findIndex(r => r[0] === 'Nama Barang');
  const invData = invRows.slice(headerIdx + 1);
  
  // Build map: rack -> row index (1-based for sheet)
  const rackToRowIdx: Record<string, number> = {};
  for (let i = 0; i < invData.length; i++) {
    const rack = String(invData[i][1] || '').trim();
    if (rack) rackToRowIdx[rack] = headerIdx + 2 + i; // +2 for header row + 1-based
  }

  const racks = [
    { rack: data.rack1, qty: data.qtyRack1 || 0 },
    { rack: data.rack2, qty: data.qtyRack2 || 0 },
    { rack: data.rack3, qty: data.qtyRack3 || 0 },
    { rack: data.rack4, qty: data.qtyRack4 || 0 },
    { rack: data.rack5, qty: data.qtyRack5 || 0 },
    { rack: data.rack6, qty: data.qtyRack6 || 0 },
  ];

  const updates = [];
  
  for (const { rack, qty } of racks) {
    if (!rack || qty === 0) continue;
    
    const rowIdx = rackToRowIdx[rack];
    
    if (rowIdx) {
      // Update existing row: add to Kuantitas Sistem (col C, index 2)
      const currentRow = invData[rowIdx - headerIdx - 2];
      const currentQty = parseInt(String(currentRow[2] || '0'), 10) || 0;
      const newQty = currentQty + qty;
      
      updates.push({
        range: `${SHEETS.INVENTORY}!C${rowIdx}`, // Kuantitas Sistem
        values: [[newQty]],
      });
      
      // Update Tanggal Inbound (col D, index 3) if newer
      updates.push({
        range: `${SHEETS.INVENTORY}!D${rowIdx}`,
        values: [[data.tanggalInbound]],
      });
      
      // Update Tanggal Kadaluarsa (col E, index 4)
      updates.push({
        range: `${SHEETS.INVENTORY}!E${rowIdx}`,
        values: [[data.tanggalKadaluarsa]],
      });
      
      // Update Nama Barang (col A, index 0) to match Master Data
      updates.push({
        range: `${SHEETS.INVENTORY}!A${rowIdx}`,
        values: [[data.namaBarang]],
      });
    } else {
      // New rack - append row (shouldn't happen if Master Data is complete, but handle anyway)
      const newRow = [
        data.namaBarang,
        rack,
        qty,
        data.tanggalInbound,
        data.tanggalKadaluarsa,
        '0', '0', '100,00%', '', '0', '0'
      ];
      await appendRow(SHEETS.INVENTORY, newRow);
    }
  }

  if (updates.length > 0) {
    await client.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates,
      },
    });
  }
}

function _str(v: any): string {
  return v === null || v === undefined ? '' : String(v);
}

function _num(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}