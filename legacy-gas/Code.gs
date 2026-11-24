// ============================================================================
//  INVENTORY CONTROL DASHBOARD  —  BBT Warehouse (Bangor)
//  Backend: Google Apps Script  |  Data source: Google Spreadsheet
// ============================================================================

const SPREADSHEET_ID = '1lBbcRlfhFplWSiKq-DJGsN3JpSuxhd0OWu0DHNNKXO8';

// Sheet names
const SH_DASHBOARD   = 'Dasboard';
const SH_INVENTORY   = 'Inventory';
const SH_MASTER      = 'Master Data';
const SH_INBOUND     = 'Inbound';
const SH_OUTBOUND    = 'Outbound';
const SH_OUTB_REQ    = 'Outbound Request';
const SH_PICKING     = 'Picking List';

// Inventory sheet layout (1-indexed, header row = 3, data starts row 4)
const INV_HEADER_ROW = 3;
const INV_FIRST_ROW  = 4;

// ============================================================================
//  WEB APP ENTRY POINT
// ============================================================================

function doGet(e) {
  try {
    const page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'Index';
    
    // Support both 'Index' and 'Index.html' naming in Apps Script editor
    let output;
    try {
      output = HtmlService.createHtmlOutputFromFile(page);
    } catch (err1) {
      // Fallback: try with or without .html extension
      const altPage = page.endsWith('.html') ? page.replace(/\.html$/, '') : (page + '.html');
      try {
        output = HtmlService.createHtmlOutputFromFile(altPage);
      } catch (err2) {
        throw new Error('Gagal memuat template "' + page + '". Pastikan file HTML bernama "' + page + '" (tanpa ekstensi .html di Apps Script editor). Detail: ' + err1.message);
      }
    }

    return output
        .setTitle('Inventory Control — BBT')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:30px;color:#b91c1c;background:#fef2f2;border:1px solid #f87171;border-radius:8px;max-width:600px;margin:40px auto;">' +
      '<h2 style="margin-top:0;">Terjadi Kesalahan Server (doGet)</h2>' +
      '<p><strong>Pesan:</strong> ' + err.message + '</p>' +
      '<p><strong>Stack:</strong> <pre style="background:#fff;padding:10px;border-radius:4px;overflow-x:auto;">' + (err.stack || '-') + '</pre></p>' +
      '</div>'
    );
  }
}

// ============================================================================
//  LOW-LEVEL HELPERS
// ============================================================================

function _ss() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function _sheet(name) {
  const sh = _ss().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ditemukan.');
  return sh;
}

/**
 * Reads a sheet as a 2D array, trimming trailing empty rows.
 */
function _readSheet(name) {
  const sh = _sheet(name);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];
  return sh.getRange(1, 1, lastRow, lastCol).getValues();
}

function _num(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function _str(v) {
  return (v === '' || v === null || v === undefined) ? '' : String(v).trim();
}

/** Round to n decimals */
function _round(v, n) {
  const f = Math.pow(10, n || 0);
  return Math.round(v * f) / f;
}

/** Format a Date / value as "DD MMM YYYY" (Indonesian-ish short month) */
function _fmtDate(v) {
  if (!v) return '';
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return _str(v);
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
  const dd = ('0' + d.getDate()).slice(-2);
  return dd + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

/** Days until a date (negative = already past) */
function _daysUntil(v) {
  if (!v) return null;
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d.getTime());
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

/**
 * Safely resolves a cell value that may be a formula string.
 * When a sheet read returns a formula (e.g. "=SUMIFS(...)") we cannot
 * evaluate it server-side; the cached value is returned by getValues()
 * only when the sheet has been calculated. This helper normalises
 * formula-strings to '' so downstream logic does not treat them as data.
 */
function _cellVal(v) {
  if (typeof v === 'string' && v.charAt(0) === '=') return '';
  return v;
}

// ============================================================================
//  INVENTORY PARSING  (single source of truth builder)
// ============================================================================

/**
 * Reads the Inventory sheet and returns an array of normalised lot rows.
 * Columns: A=Nama Barang, B=Nomor Rak, C=Kuantitas Sistem,
 *          D=Tanggal Inbound, E=Tanggal Kadaluarsa, F=Stok Aktual (SOH),
 *          G=Variance, H=Akurasi, I=Status FEFO, J=Urutan FEFO,
 *          K=Kunci FEFO, L=Stock Picking, M=(spare)
 */
function _getInventoryLots() {
  const sh = _sheet(SH_INVENTORY);
  const lastRow = sh.getLastRow();
  if (lastRow < INV_FIRST_ROW) return [];

  const n = lastRow - INV_FIRST_ROW + 1;
  // A..M  => 13 columns
  const vals = sh.getRange(INV_FIRST_ROW, 1, n, 13).getValues();

  const lots = [];
  vals.forEach(function (row, i) {
    const excelRow = INV_FIRST_ROW + i;

    const nama      = _str(_cellVal(row[0]));
    const rak       = _str(_cellVal(row[1]));
    const qtySistem = _num(_cellVal(row[2]));
    const tglIn     = _cellVal(row[3]) || null;
    const tglExp    = _cellVal(row[4]) || null;
    const soh       = _num(_cellVal(row[5]));
    const variance  = _num(_cellVal(row[6]));
    const akurasi   = _num(_cellVal(row[7]));
    const status    = _str(_cellVal(row[8]));
    const urutan    = _num(_cellVal(row[9]));
    const picking   = _num(_cellVal(row[11]));

    // Skip fully blank rows
    if (!nama && !rak && qtySistem === 0 && soh === 0) return;

    lots.push({
      row:          excelRow,
      namaBarang:   nama,
      nomorRak:     rak,
      qtySistem:    qtySistem,
      tanggalInbound: tglIn,
      tanggalExpired: tglExp,
      expiredLabel: _fmtDate(tglExp),
      daysToExpiry: _daysUntil(tglExp),
      soh:          soh,
      variance:     variance,
      akurasi:      akurasi,
      statusFefo:   status,
      urutanFefo:   urutan,
      stockPicking: picking
    });
  });

  return lots;
}

/**
 * Builds a Master Data map: SKU -> { category, unit, barcode, locationType }
 * Master Data layout (header row 3, data row 4+):
 * A=Nomor Rak, B=NAMA BARANG, C=KUANTITAS, D=Jenis Lokasi,
 * F=Kategori, G=Nama Barang, H=Satuan, I=Barcode, J=dus per palet,
 * K=kebutuhan palet, M=Kebutuhan, N=Avg Day/Dus, O=Gramasi/Dus
 */
function _getMasterMap() {
  const sh = _sheet(SH_MASTER);
  const lastRow = sh.getLastRow();
  if (lastRow < INV_FIRST_ROW) return { bySku: {}, racks: [] };

  const n = lastRow - INV_FIRST_ROW + 1;
  const vals = sh.getRange(INV_FIRST_ROW, 1, n, 15).getValues();

  const bySku = {};   // skuName(lower) -> meta
  const racks = [];   // list of rack records

  vals.forEach(function (row) {
    const rack      = _str(_cellVal(row[0]));
    const skuName   = _str(_cellVal(row[1]));
    const lokasi    = _str(_cellVal(row[3]));
    const kategori  = _str(_cellVal(row[5]));
    const satuan    = _str(_cellVal(row[7]));
    const barcode   = _cellVal(row[8]);
    const dusPalet  = _num(_cellVal(row[9]));
    const avgDay    = _num(_cellVal(row[13]));

    if (!rack && !skuName) return;

    racks.push({
      rack: rack,
      skuName: skuName,
      locationType: lokasi
    });

    if (skuName) {
      const key = skuName.toLowerCase();
      if (!bySku[key]) {
        bySku[key] = {
          skuName: skuName,
          category: kategori,
          unit: satuan,
          barcode: barcode,
          locationType: lokasi,
          dusPerPallet: dusPalet,
          avgDayPerDus: avgDay
        };
      } else {
        // Fill in gaps
        if (!bySku[key].category && kategori) bySku[key].category = kategori;
        if (!bySku[key].unit && satuan) bySku[key].unit = satuan;
        if (!bySku[key].barcode && barcode) bySku[key].barcode = barcode;
      }
    }
  });

  return { bySku: bySku, racks: racks };
}

// ============================================================================
//  PUBLIC API  —  DASHBOARD
// ============================================================================

/**
 * Returns KPI summary for the dashboard header cards,
 * computed live from the Inventory sheet (not from the static Dashboard sheet).
 */
function getDashboardSummary() {
  const lots = _getInventoryLots();

  let totalSkuSet   = {};
  let totalQtySystem = 0;
  let totalSoh       = 0;
  let totalVariance  = 0;
  let akurasiSum     = 0;
  let akurasiCount   = 0;
  let lotExpired     = 0;
  let lotExpiredToday = 0;
  let lotOutOfStock  = 0;
  let lotLowStock    = 0;
  let activeLots     = 0;

  lots.forEach(function (l) {
    if (l.namaBarang) totalSkuSet[l.namaBarang.toLowerCase()] = true;
    totalQtySystem += l.qtySistem;
    totalSoh       += l.soh;
    totalVariance  += l.variance;

    if (l.akurasi > 0) { akurasiSum += l.akurasi; akurasiCount++; }

    const st = (l.statusFefo || '').toUpperCase();
    if (st === 'EXPIRED') lotExpired++;
    if (st === 'EXPIRED HARI INI') { lotExpiredToday++; lotExpired++; }
    if (st === 'HABIS' || l.qtySistem <= 0) lotOutOfStock++;
    if (l.qtySistem > 0 && l.qtySistem <= 50) lotLowStock++;

    if (l.qtySistem > 0) activeLots++;
  });

  return {
    totalSku: Object.keys(totalSkuSet).length,
    totalRows: lots.length,
    activeLots: activeLots,
    totalQtySystem: totalQtySystem,
    totalSoh: totalSoh,
    totalVariance: totalVariance,
    avgAkurasi: akurasiCount ? _round(akurasiSum / akurasiCount, 4) : 0,
    lotExpired: lotExpired,
    lotExpiredToday: lotExpiredToday,
    lotOutOfStock: lotOutOfStock
  };
}

/**
 * Returns an aggregated stock view: one row per SKU (sum across all racks).
 * Sorted by total stock descending.
 */
function getStockBySku() {
  const lots = _getInventoryLots();
  const master = _getMasterMap().bySku;

  const agg = {};   // key(lower) -> record

  lots.forEach(function (l) {
    if (!l.namaBarang) return;
    const key = l.namaBarang.toLowerCase();
    if (!agg[key]) {
      agg[key] = {
        namaBarang: l.namaBarang,
        totalQtySystem: 0,
        totalSoh: 0,
        totalVariance: 0,
        rackCount: 0,
        racks: [],
        statuses: {},
        earliestExpiry: null,
        earliestExpiryDays: null,
        stockPicking: 0
      };
    }
    const a = agg[key];
    a.totalQtySystem += l.qtySistem;
    a.totalSoh       += l.soh;
    a.totalVariance  += l.variance;
    a.stockPicking   += l.stockPicking;

    if (l.qtySistem > 0) {
      a.rackCount++;
      a.racks.push(l.nomorRak);
    }

    const st = l.statusFefo || 'TIDAK DIKETAHUI';
    a.statuses[st] = (a.statuses[st] || 0) + 1;

    if (l.tanggalExpired) {
      if (a.earliestExpiryDays === null || l.daysToExpiry < a.earliestExpiryDays) {
        a.earliestExpiryDays = l.daysToExpiry;
        a.earliestExpiry = l.expiredLabel;
      }
    }
  });

  const rows = Object.keys(agg).map(function (k) {
    const a = agg[k];
    const meta = master[k] || {};
    let worst = 'OK';
    if (a.statuses['HABIS'] && a.totalQtySystem <= 0) worst = 'HABIS';
    else if (a.statuses['EXPIRED']) worst = 'EXPIRED';
    else if (a.statuses['EXPIRED HARI INI']) worst = 'EXPIRED HARI INI';
    else if (a.totalQtySystem <= 0) worst = 'HABIS';

    return {
      namaBarang: a.namaBarang,
      category: meta.category || '-',
      unit: meta.unit || '-',
      barcode: meta.barcode || '',
      totalQtySystem: a.totalQtySystem,
      totalSoh: a.totalSoh,
      totalVariance: a.totalVariance,
      rackCount: a.rackCount,
      racks: a.racks.slice(0, 8),
      moreRacks: Math.max(0, a.rackCount - 8),
      stockPicking: a.stockPicking,
      earliestExpiry: a.earliestExpiry || '-',
      earliestExpiryDays: a.earliestExpiryDays,
      statusFefo: worst
    };
  });

  rows.sort(function (x, y) { return y.totalQtySystem - x.totalQtySystem; });
  return rows;
}

/**
 * Returns the full rack/lot detail, optionally filtered.
 * @param {Object} opts { sku, rack, status, category }
 */
function getStockDetail(opts) {
  opts = opts || {};
  const skuFilter  = (opts.sku || '').toLowerCase();
  const rackFilter = (opts.rack || '').toLowerCase();
  const statFilter = (opts.status || '').toUpperCase();
  const catFilter  = (opts.category || '').toLowerCase();

  const lots = _getInventoryLots();
  const master = _getMasterMap().bySku;

  let rows = lots.filter(function (l) {
    if (!l.namaBarang && !l.nomorRak) return false;
    if (l.qtySistem === 0 && l.soh === 0) return false;

    if (skuFilter && l.namaBarang.toLowerCase().indexOf(skuFilter) === -1) return false;
    if (rackFilter && l.nomorRak.toLowerCase().indexOf(rackFilter) === -1) return false;
    if (statFilter && (l.statusFefo || '').toUpperCase() !== statFilter) return false;
    if (catFilter) {
      const meta = master[l.namaBarang.toLowerCase()] || {};
      if ((meta.category || '').toLowerCase() !== catFilter) return false;
    }
    return true;
  });

  rows = rows.map(function (l) {
    const meta = master[l.namaBarang.toLowerCase()] || {};
    return {
      nomorRak: l.nomorRak,
      namaBarang: l.namaBarang || '(kosong)',
      category: meta.category || '-',
      unit: meta.unit || '-',
      qtySistem: l.qtySistem,
      soh: l.soh,
      variance: l.variance,
      akurasi: l.akurasi,
      statusFefo: l.statusFefo || '-',
      tanggalExpired: l.expiredLabel || '-',
      daysToExpiry: l.daysToExpiry,
      stockPicking: l.stockPicking
    };
  });

  // Urgent first: expired, then expiring, then empty
  rows.sort(function (a, b) {
    const rank = function (r) {
      const st = (r.statusFefo || '').toUpperCase();
      if (st === 'EXPIRED HARI INI') return 0;
      if (st === 'EXPIRED') return 1;
      if (st === 'HABIS') return 2;
      if (r.daysToExpiry !== null && r.daysToExpiry <= 30) return 3;
      return 4;
    };
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.nomorRak.localeCompare(b.nomorRak);
  });

  return rows;
}

/**
 * Returns alerts the stock keeper must act on:
 * expired lots, expiring soon, and stock-out SKUs.
 */
function getAlerts() {
  const lots = _getInventoryLots();

  const expired = [];
  const expiringSoon = [];
  const outOfStockNames = {};

  lots.forEach(function (l) {
    const st = (l.statusFefo || '').toUpperCase();
    const rec = {
      nomorRak: l.nomorRak,
      namaBarang: l.namaBarang || '(kosong)',
      qtySistem: l.qtySistem,
      tanggalExpired: l.expiredLabel || '-',
      daysToExpiry: l.daysToExpiry
    };

    if (st === 'EXPIRED' || st === 'EXPIRED HARI INI') {
      expired.push(rec);
    } else if (l.daysToExpiry !== null && l.daysToExpiry >= 0 && l.daysToExpiry <= 30 && l.qtySistem > 0) {
      expiringSoon.push(rec);
    }

    if (l.namaBarang && l.qtySistem <= 0) {
      outOfStockNames[l.namaBarang] = true;
    }
  });

  expired.sort(function (a, b) { return (a.daysToExpiry || 0) - (b.daysToExpiry || 0); });
  expiringSoon.sort(function (a, b) { return (a.daysToExpiry || 0) - (b.daysToExpiry || 0); });

  return {
    expired: expired,
    expiringSoon: expiringSoon,
    outOfStock: Object.keys(outOfStockNames).sort()
  };
}

/**
 * Returns distribution of stock by storage location type
 * (RACKING / FLOOR / CONTAINER), based on Master Data.
 */
function getZoneDistribution() {
  const lots = _getInventoryLots();
  const masterData = _getMasterMap();
  const bySku = masterData.bySku;

  const zones = {};   // type -> { lots, qty }

  lots.forEach(function (l) {
    if (!l.nomorRak) return;
    const meta = bySku[(l.namaBarang || '').toLowerCase()] || {};
    const type = meta.locationType || 'LAINNYA';
    if (!zones[type]) zones[type] = { zone: type, lotCount: 0, totalQty: 0, skuSet: {} };
    zones[type].lotCount++;
    zones[type].totalQty += l.qtySistem;
    if (l.namaBarang) zones[type].skuSet[l.namaBarang] = true;
  });

  return Object.keys(zones).map(function (k) {
    return {
      zone: zones[k].zone,
      lotCount: zones[k].lotCount,
      totalQty: zones[k].totalQty,
      skuCount: Object.keys(zones[k].skuSet).length
    };
  }).sort(function (a, b) { return b.totalQty - a.totalQty; });
}

/**
 * Returns top-N SKUs by category (Dry / Frozen) for charting.
 */
function getCategoryBreakdown() {
  const rows = getStockBySku();
  const cats = {};
  rows.forEach(function (r) {
    const c = r.category || 'Lainnya';
    if (!cats[c]) cats[c] = { category: c, skuCount: 0, totalQty: 0 };
    cats[c].skuCount++;
    cats[c].totalQty += r.totalQtySystem;
  });
  return Object.keys(cats).map(function (k) { return cats[k]; })
    .sort(function (a, b) { return b.totalQty - a.totalQty; });
}

/**
 * SINGLE round-trip endpoint for the dashboard.
 * Apps Script RPC has meaningful latency, so we batch everything into one call.
 */
function getFullDashboard() {
  return {
    summary:      getDashboardSummary(),
    stockBySku:   getStockBySku(),
    stockDetail:  getStockDetail({}),
    alerts:       getAlerts(),
    zones:        getZoneDistribution(),
    categories:   getCategoryBreakdown(),
    topSku:       getStockBySku().slice(0, 10),
    generatedAt:  new Date().toISOString()
  };
}

// ============================================================================
//  PUBLIC API  —  MASTER LISTS (for filters)
// ============================================================================

function getSkuList() {
  return getStockBySku().map(function (r) { return r.namaBarang; });
}

function getRackList() {
  const racks = _getMasterMap().racks
    .map(function (r) { return r.rack; })
    .filter(function (r) { return r !== ''; });
  // unique + sort
  const seen = {};
  return racks.filter(function (r) {
    if (seen[r]) return false;
    seen[r] = true;
    return true;
  }).sort();
}

// ============================================================================
//  PUBLIC API  —  INBOUND (Penerimaan Barang)
// ============================================================================

/** Returns all SKU names from Master Data for dropdown */
function getSKUNames() {
  const master = _getMasterMap().bySku;
  return Object.keys(master)
    .map(function (k) { return master[k].skuName; })
    .sort();
}

/** Returns rack details with current stock for a given SKU */
function getRackDetailsBySKU(skuName) {
  const lots = _getInventoryLots();
  const master = _getMasterMap();
  const key = (skuName || '').toLowerCase();

  // Build stock map per rack for this SKU
  const skuStock = {};
  lots.forEach(function (l) {
    if (l.namaBarang && l.namaBarang.toLowerCase() === key) {
      skuStock[l.nomorRak] = (skuStock[l.nomorRak] || 0) + l.qtySistem;
    }
  });

  // Get unique racks from Master Data
  const seen = {};
  const racks = master.racks
    .map(function (r) { return r.rack; })
    .filter(function (r) {
      if (seen[r] || r === '') return false;
      seen[r] = true;
      return true;
    })
    .sort();

  return racks.map(function (rack) {
    return {
      rack: rack,
      qtySistem: skuStock[rack] || 0
    };
  });
}

/** Submit inbound data to Inbound sheet (append row) */
function submitInboundData(data) {
  const sh = _sheet(SH_INBOUND);
  
  // Build row matching Inbound sheet columns:
  // A=Barcode, B=Nama Barang, C=Qty, D=Tanggal Inbound, E=Tanggal Kadaluarsa,
  // F=Nomor SJ, G-R=Rack Tujuan 1-6 + Qty To Rack pairs, S=Remarks
  const row = [
    _str(data.barcode),           // A
    _str(data.namaBarang),        // B
    _num(data.totalQty),          // C - total qty
    _str(data.tanggalInbound),    // D
    _str(data.tanggalKadaluarsa), // E
    _str(data.nomorSJ),           // F
    // G-R: 12 columns = 6 rack+qty pairs
    _str(data.rack1 || ''), _num(data.qtyRack1 || 0),   // G,H
    _str(data.rack2 || ''), _num(data.qtyRack2 || 0),   // I,J
    _str(data.rack3 || ''), _num(data.qtyRack3 || 0),   // K,L
    _str(data.rack4 || ''), _num(data.qtyRack4 || 0),   // M,N
    _str(data.rack5 || ''), _num(data.qtyRack5 || 0),   // O,P
    _str(data.rack6 || ''), _num(data.qtyRack6 || 0),   // Q,R
    _str(data.remarks)            // S
  ];
  
  sh.appendRow(row);
  return { success: true, message: 'Data inbound berhasil disimpan.' };
}
