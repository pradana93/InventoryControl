// scripts/run-calculator-tests.ts
import { calculateInventoryMetrics, CalculatorInput } from '../src/lib/inventory-calculator';
import { CatalogEntry, LedgerEntry, InventoryLot } from '../src/lib/db';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failed++;
  }
}

function assertCloseTo(val: number, expected: number, testName: string, precision = 0.01) {
  const diff = Math.abs(val - expected);
  if (diff <= precision) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName} - expected ${expected}, got ${val} (diff: ${diff})`);
    failed++;
  }
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function generate30DaysLedger(skuName: string, dailyUsage: number, prefix: string): LedgerEntry[] {
  return Array.from({ length: 30 }, (_, i) => ({
    recordId: `${prefix}-${i + 1}`,
    timestamp: daysAgo(i + 1),
    skuName,
    rackId: 'R1',
    qtyIn: -dailyUsage,
    expiredDate: '',
    sjNumber: `SJ-${i + 1}`,
    remarks: 'Outbound',
    entitas: 'BBB',
  }));
}

console.log('--- Running Inventory Calculator Tests ---\n');

// 1. Test DOI = Infinity when avgDailyUsage = 0
{
  const input: CalculatorInput = {
    lots: [{
      nomorRak: 'R1', namaBarang: 'ZeroUsageItem', qtySistem: 50, tanggalInbound: daysAgo(10),
      tanggalExpired: '', expiredLabel: '', daysToExpiry: 999, soh: 50, variance: 0,
      akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 50, barcode: '',
      category: 'General', unit: 'Pcs', skuId: 'SKU-0', jenisLokasi: '', entitas: 'BBB'
    }],
    catalog: [{
      skuId: 'SKU-0', namaBarang: 'ZeroUsageItem', satuan: 'Pcs', kategori: 'General',
      status: 'Active', entitas: 'BBB', barcode: '', unitCost: 1000, leadTimeDays: 3, safetyStockDays: 3
    }],
    ledger: [],
    entity: 'ALL',
  };
  const [res] = calculateInventoryMetrics(input);
  assert(res.doi === Infinity, 'DOI should be Infinity when avgDailyUsage is 0');
  assert(res.avgDailyUsage === 0, 'avgDailyUsage should be 0 when no outbound ledger');
}

// 2. Test KRITIS when doi < leadTime
{
  const input: CalculatorInput = {
    lots: [{
      nomorRak: 'R1', namaBarang: 'KritisItem', qtySistem: 10, tanggalInbound: daysAgo(10),
      tanggalExpired: '', expiredLabel: '', daysToExpiry: 999, soh: 10, variance: 0,
      akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 10, barcode: '',
      category: 'General', unit: 'Pcs', skuId: 'SKU-K', jenisLokasi: '', entitas: 'BBB'
    }],
    catalog: [{
      skuId: 'SKU-K', namaBarang: 'KritisItem', satuan: 'Pcs', kategori: 'General',
      status: 'Active', entitas: 'BBB', barcode: '', unitCost: 1000, leadTimeDays: 5, safetyStockDays: 3
    }],
    ledger: generate30DaysLedger('KritisItem', 5, 'L-K'), // 5 per day -> doi = 10 / 5 = 2 < 5
    entity: 'ALL',
  };
  const [res] = calculateInventoryMetrics(input);
  assert(res.status === 'KRITIS', 'Status should be KRITIS when coverageDays < 0 (doi < leadTime)');
  assert(res.doi === 2, 'DOI should equal currentStock / avgDailyUsage');
  assert(res.coverageDays === -3, 'CoverageDays should equal doi - leadTimeDays (2 - 5 = -3)');
}

// 3. Test ROP = usage * LT + usage * safetyDays
{
  const input: CalculatorInput = {
    lots: [{
      nomorRak: 'R1', namaBarang: 'RopItem', qtySistem: 100, tanggalInbound: daysAgo(10),
      tanggalExpired: '', expiredLabel: '', daysToExpiry: 999, soh: 100, variance: 0,
      akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 100, barcode: '',
      category: 'General', unit: 'Pcs', skuId: 'SKU-R', jenisLokasi: '', entitas: 'BBB'
    }],
    catalog: [{
      skuId: 'SKU-R', namaBarang: 'RopItem', satuan: 'Pcs', kategori: 'General',
      status: 'Active', entitas: 'BBB', barcode: '', unitCost: 1000, leadTimeDays: 4, safetyStockDays: 2
    }],
    ledger: generate30DaysLedger('RopItem', 10, 'L-R'), // usage = 10
    entity: 'ALL',
  };
  const [res] = calculateInventoryMetrics(input);
  // safetyStockQty = 10 * 2 = 20
  // ropQty = 10 * 4 + 20 = 60
  assert(res.safetyStockQty === 20, 'Safety stock qty should be usage * safetyStockDays');
  assert(res.ropQty === 60, 'ROP should be usage * leadTimeDays + safetyStockQty');
}

// 4. Test Saran Order = max(0, ROP - currentStock)
{
  // 4a. ROP > currentStock (Needs Order)
  const inputNeedsOrder: CalculatorInput = {
    lots: [{
      nomorRak: 'R1', namaBarang: 'OrderItem', qtySistem: 30, tanggalInbound: daysAgo(10),
      tanggalExpired: '', expiredLabel: '', daysToExpiry: 999, soh: 30, variance: 0,
      akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 30, barcode: '',
      category: 'General', unit: 'Pcs', skuId: 'SKU-O', jenisLokasi: '', entitas: 'BBB'
    }],
    catalog: [{
      skuId: 'SKU-O', namaBarang: 'OrderItem', satuan: 'Pcs', kategori: 'General',
      status: 'Active', entitas: 'BBB', barcode: '', unitCost: 1000, leadTimeDays: 5, safetyStockDays: 3
    }],
    ledger: generate30DaysLedger('OrderItem', 10, 'L-O1'), // usage = 10, rop = 50 + 30 = 80
    entity: 'ALL',
  };
  const [resNeeds] = calculateInventoryMetrics(inputNeedsOrder);
  assert(resNeeds.saranOrderQty === 50, 'Saran Order should be max(0, 80 - 30) = 50');

  // 4b. ROP <= currentStock (No Order Needed)
  const inputNoOrder: CalculatorInput = {
    lots: [{
      nomorRak: 'R1', namaBarang: 'OrderItem', qtySistem: 100, tanggalInbound: daysAgo(10),
      tanggalExpired: '', expiredLabel: '', daysToExpiry: 999, soh: 100, variance: 0,
      akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 100, barcode: '',
      category: 'General', unit: 'Pcs', skuId: 'SKU-O', jenisLokasi: '', entitas: 'BBB'
    }],
    catalog: [{
      skuId: 'SKU-O', namaBarang: 'OrderItem', satuan: 'Pcs', kategori: 'General',
      status: 'Active', entitas: 'BBB', barcode: '', unitCost: 1000, leadTimeDays: 5, safetyStockDays: 3
    }],
    ledger: generate30DaysLedger('OrderItem', 10, 'L-O2'),
    entity: 'ALL',
  };
  const [resNoOrder] = calculateInventoryMetrics(inputNoOrder);
  assert(resNoOrder.saranOrderQty === 0, 'Saran Order should be max(0, 80 - 100) = 0');
}

// 5. Test status transitions (KRITIS / AMAN / OVERSTOCK)
{
  const makeStatusInput = (stock: number): CalculatorInput => ({
    lots: [{
      nomorRak: 'R1', namaBarang: 'StatusItem', qtySistem: stock, tanggalInbound: daysAgo(10),
      tanggalExpired: '', expiredLabel: '', daysToExpiry: 999, soh: stock, variance: 0,
      akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: stock, barcode: '',
      category: 'General', unit: 'Pcs', skuId: 'SKU-S', jenisLokasi: '', entitas: 'BBB'
    }],
    catalog: [{
      skuId: 'SKU-S', namaBarang: 'StatusItem', satuan: 'Pcs', kategori: 'General',
      status: 'Active', entitas: 'BBB', barcode: '', unitCost: 1000, leadTimeDays: 10, safetyStockDays: 5
    }],
    ledger: generate30DaysLedger('StatusItem', 2, 'L-S'), // usage = 2
    entity: 'ALL',
  });

  // stock = 10 -> doi = 5, coverage = 5 - 10 = -5 -> KRITIS
  const [resKritis] = calculateInventoryMetrics(makeStatusInput(10));
  assert(resKritis.status === 'KRITIS', 'Status should be KRITIS when coverageDays < 0');

  // stock = 50 -> doi = 25, coverage = 25 - 10 = 15 <= 30 -> AMAN
  const [resAman] = calculateInventoryMetrics(makeStatusInput(50));
  assert(resAman.status === 'AMAN', 'Status should be AMAN when 0 <= coverageDays <= LT * 3');

  // stock = 90 -> doi = 45, coverage = 45 - 10 = 35 > 30 -> OVERSTOCK
  const [resOverstock] = calculateInventoryMetrics(makeStatusInput(90));
  assert(resOverstock.status === 'OVERSTOCK', 'Status should be OVERSTOCK when coverageDays > LT * 3');
}

// 6. Test Forecast WMA-5m and SIMPLE-AVG
{
  const today = new Date();

  // 6a. 5 months history -> WMA-5m
  const wmaLedger: LedgerEntry[] = [];
  const monthlyTotals = [100, 120, 140, 160, 180]; // oldest (m4) to newest (m0)
  for (let i = 4; i >= 0; i--) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 15);
    wmaLedger.push({
      recordId: `WMA-${i}`,
      timestamp: monthStart.toISOString(),
      skuName: 'WmaItem',
      rackId: 'R1',
      qtyIn: -monthlyTotals[4 - i],
      expiredDate: '',
      sjNumber: '',
      remarks: '',
      entitas: 'BBB',
    });
  }
  const inputWMA: CalculatorInput = {
    lots: [{
      nomorRak: 'R1', namaBarang: 'WmaItem', qtySistem: 50, tanggalInbound: daysAgo(10),
      tanggalExpired: '', expiredLabel: '', daysToExpiry: 999, soh: 50, variance: 0,
      akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 50, barcode: '',
      category: 'General', unit: 'Pcs', skuId: 'SKU-W', jenisLokasi: '', entitas: 'BBB'
    }],
    catalog: [{
      skuId: 'SKU-W', namaBarang: 'WmaItem', satuan: 'Pcs', kategori: 'General',
      status: 'Active', entitas: 'BBB', barcode: '', unitCost: 1000, leadTimeDays: 5, safetyStockDays: 3
    }],
    ledger: wmaLedger,
    entity: 'ALL',
  };
  const [resWMA] = calculateInventoryMetrics(inputWMA);
  assert(resWMA.forecastMethod === 'WMA-5m', 'Forecast method should be WMA-5m when >= 3 months data');
  assert(resWMA.forecastStatus === 'OK', 'Forecast status should be OK when >= 3 months data');
  assertCloseTo(resWMA.forecast30d, 153.333, 'Forecast 30d should match WMA calculation');

  // 6b. 2 months history -> SIMPLE-AVG
  const simpleLedger: LedgerEntry[] = [];
  const lowTotals = [100, 120];
  for (let i = 1; i >= 0; i--) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 15);
    simpleLedger.push({
      recordId: `SIM-${i}`,
      timestamp: monthStart.toISOString(),
      skuName: 'SimpleItem',
      rackId: 'R1',
      qtyIn: -lowTotals[1 - i],
      expiredDate: '',
      sjNumber: '',
      remarks: '',
      entitas: 'BBB',
    });
  }
  const inputSimple: CalculatorInput = {
    lots: [{
      nomorRak: 'R1', namaBarang: 'SimpleItem', qtySistem: 50, tanggalInbound: daysAgo(10),
      tanggalExpired: '', expiredLabel: '', daysToExpiry: 999, soh: 50, variance: 0,
      akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 50, barcode: '',
      category: 'General', unit: 'Pcs', skuId: 'SKU-S2', jenisLokasi: '', entitas: 'BBB'
    }],
    catalog: [{
      skuId: 'SKU-S2', namaBarang: 'SimpleItem', satuan: 'Pcs', kategori: 'General',
      status: 'Active', entitas: 'BBB', barcode: '', unitCost: 1000, leadTimeDays: 5, safetyStockDays: 3
    }],
    ledger: simpleLedger,
    entity: 'ALL',
  };
  const [resSimple] = calculateInventoryMetrics(inputSimple);
  assert(resSimple.forecastMethod === 'SIMPLE-AVG', 'Forecast method should be SIMPLE-AVG when < 3 months data');
  assert(resSimple.forecastStatus === 'LOW_DATA', 'Forecast status should be LOW_DATA when < 3 months data');
  assertCloseTo(resSimple.forecast30d, 110, 'Forecast 30d should match simple average (100+120)/2 = 110');
}

// 7. Test Entity filtering
{
  const inputEntity: CalculatorInput = {
    lots: [
      { nomorRak: 'R1', namaBarang: 'BBB-Item', qtySistem: 10, tanggalInbound: daysAgo(1), tanggalExpired: '', expiredLabel: '', daysToExpiry: 999, soh: 10, variance: 0, akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 10, barcode: '', category: '', unit: '', skuId: '1', jenisLokasi: '', entitas: 'BBB' },
      { nomorRak: 'R2', namaBarang: 'BBT-Item', qtySistem: 20, tanggalInbound: daysAgo(1), tanggalExpired: '', expiredLabel: '', daysToExpiry: 999, soh: 20, variance: 0, akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 20, barcode: '', category: '', unit: '', skuId: '2', jenisLokasi: '', entitas: 'BBT' },
    ],
    catalog: [
      { skuId: '1', namaBarang: 'BBB-Item', satuan: 'Pcs', kategori: '', status: 'Active', entitas: 'BBB', barcode: '', unitCost: 10, leadTimeDays: 3, safetyStockDays: 3 },
      { skuId: '2', namaBarang: 'BBT-Item', satuan: 'Pcs', kategori: '', status: 'Active', entitas: 'BBT', barcode: '', unitCost: 10, leadTimeDays: 3, safetyStockDays: 3 },
    ],
    ledger: [],
    entity: 'BBB',
  };
  const resBBB = calculateInventoryMetrics(inputEntity);
  assert(resBBB.length === 1 && resBBB[0].skuName === 'BBB-Item', 'Entity filtering should only return BBB items when entity="BBB"');

  const resALL = calculateInventoryMetrics({ ...inputEntity, entity: 'ALL' });
  assert(resALL.length === 2, 'Entity filtering should return all items when entity="ALL"');
}

console.log(`\n--- Results: ${passed} PASSED, ${failed} FAILED ---`);
if (failed > 0) {
  process.exit(1);
}
