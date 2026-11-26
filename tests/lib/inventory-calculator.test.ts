// tests/lib/inventory-calculator.test.ts
import { calculateInventoryMetrics, CalculatorInput } from '@/lib/inventory-calculator';
import { CatalogEntry, LedgerEntry, InventoryLot } from '@/lib/db';

// Minimal self-contained test harness for TypeScript runner
let suiteName = '';
let passedCount = 0;
let failedCount = 0;

function describe(name: string, fn: () => void) {
  suiteName = name;
  console.log(`\n=== Suite: ${name} ===`);
  fn();
}

function it(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failedCount++;
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
      }
    },
    toBeLessThan(expected: number) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (!(actual >= expected)) {
        throw new Error(`Expected ${actual} to be >= ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      if (!(actual <= expected)) {
        throw new Error(`Expected ${actual} to be <= ${expected}`);
      }
    },
    toBeCloseTo(expected: number, precision = 2) {
      const diff = Math.abs(actual - expected);
      const tolerance = Math.pow(10, -precision) / 2;
      if (diff > tolerance) {
        throw new Error(`Expected ${actual} to be close to ${expected} (diff: ${diff}, tolerance: ${tolerance})`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined`);
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected value to be undefined, received ${JSON.stringify(actual)}`);
      }
    },
  };
}

// Helpers
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

const mockCatalogEntries: CatalogEntry[] = [
  { skuId: 'SKU001', namaBarang: 'Apple', satuan: 'pcs', kategori: 'Fruit', status: 'Active', entitas: 'BBB', barcode: '12345', unitCost: 1.0, leadTimeDays: 5, safetyStockDays: 3 },
  { skuId: 'SKU002', namaBarang: 'Banana', satuan: 'pcs', kategori: 'Fruit', status: 'Active', entitas: 'BBB', barcode: '67890', unitCost: 0.5, leadTimeDays: 7, safetyStockDays: 4 },
  { skuId: 'SKU003', namaBarang: 'Orange', satuan: 'pcs', kategori: 'Fruit', status: 'Active', entitas: 'BBT', barcode: '11223', unitCost: 0.75, leadTimeDays: 3, safetyStockDays: 2 },
  { skuId: 'SKU004', namaBarang: 'Grapes', satuan: 'kg', kategori: 'Fruit', status: 'Inactive', entitas: 'BBB', barcode: '44556', unitCost: 2.0, leadTimeDays: 5, safetyStockDays: 3 },
];

const mockInventoryLots: InventoryLot[] = [
  { nomorRak: 'R1', namaBarang: 'Apple', qtySistem: 100, tanggalInbound: daysAgo(30), tanggalExpired: '', expiredLabel: 'OK', daysToExpiry: 15, soh: 100, variance: 0, akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 100, barcode: '12345', category: 'Fruit', unit: 'pcs', skuId: 'SKU001', jenisLokasi: 'FIFO', entitas: 'BBB' },
  { nomorRak: 'R2', namaBarang: 'Apple', qtySistem: 50, tanggalInbound: daysAgo(20), tanggalExpired: '', expiredLabel: 'OK', daysToExpiry: 20, soh: 50, variance: 0, akurasi: 100, statusFefo: 'OK', urutanFefo: 2, stockPicking: 50, barcode: '12345', category: 'Fruit', unit: 'pcs', skuId: 'SKU001', jenisLokasi: 'FIFO', entitas: 'BBB' },
  { nomorRak: 'R4', namaBarang: 'Banana', qtySistem: 200, tanggalInbound: daysAgo(25), tanggalExpired: '', expiredLabel: 'EXPIRED HARI INI', daysToExpiry: 0, soh: 200, variance: 0, akurasi: 100, statusFefo: 'EXPIRED HARI INI', urutanFefo: 1, stockPicking: 200, barcode: '67890', category: 'Fruit', unit: 'pcs', skuId: 'SKU002', jenisLokasi: 'FIFO', entitas: 'BBB' },
  { nomorRak: 'R5', namaBarang: 'Orange', qtySistem: 75, tanggalInbound: daysAgo(18), tanggalExpired: '', expiredLabel: 'OK', daysToExpiry: 1, soh: 75, variance: 0, akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 75, barcode: '11223', category: 'Fruit', unit: 'pcs', skuId: 'SKU003', jenisLokasi: 'FIFO', entitas: 'BBT' },
];

describe('inventory-calculator', () => {

  // 1. DOI = Infinity when avgDailyUsage = 0
  it('should return Infinity for DOI when avgDailyUsage is 0', () => {
    const input: CalculatorInput = {
      lots: [
        { ...mockInventoryLots[0], namaBarang: 'NoUsageItem', qtySistem: 100, skuId: 'SKU005' },
      ],
      catalog: [
        { ...mockCatalogEntries[0], namaBarang: 'NoUsageItem', skuId: 'SKU005', unitCost: 5, leadTimeDays: 2, safetyStockDays: 1 },
      ],
      ledger: [],
      entity: 'ALL',
    };
    const result = calculateInventoryMetrics(input)[0];
    expect(result.doi).toBe(Infinity);
    expect(result.avgDailyUsage).toBe(0);
  });

  // 2. KRITIS when doi < leadTime
  it('should set status to KRITIS when doi < leadTimeDays', () => {
    const input: CalculatorInput = {
      lots: [
        { ...mockInventoryLots[0], namaBarang: 'LowStockItem', qtySistem: 10, skuId: 'SKU006' },
      ],
      catalog: [
        { ...mockCatalogEntries[0], namaBarang: 'LowStockItem', skuId: 'SKU006', unitCost: 5, leadTimeDays: 10, safetyStockDays: 3 },
      ],
      ledger: generate30DaysLedger('LowStockItem', 5, 'L11'),
      entity: 'ALL',
    };
    const result = calculateInventoryMetrics(input)[0];
    expect(result.status).toBe('KRITIS');
    expect(result.doi).toBeLessThan(result.leadTimeDays);
    expect(result.coverageDays).toBeLessThan(0);
  });

  // 3. ROP = usage * LT + usage * safetyDays
  it('should calculate ROP correctly', () => {
    const skuName = 'Apple';
    const dailyUsage = 10;
    const input: CalculatorInput = {
      lots: [mockInventoryLots[0]],
      catalog: [mockCatalogEntries[0]],
      ledger: generate30DaysLedger(skuName, dailyUsage, 'L'),
      entity: 'ALL',
    };
    const result = calculateInventoryMetrics(input)[0];
    expect(result.avgDailyUsage).toBe(10);
    expect(result.safetyStockQty).toBe(30); // 10 * 3
    expect(result.ropQty).toBe(80); // 10 * 5 + 30
  });

  // 4. Saran Order = max(0, ROP - currentStock)
  it('should calculate Saran Order Quantity correctly', () => {
    const dailyUsage = 10;

    // Case 1: ROP > currentStock (80 - 20 = 60)
    const input1: CalculatorInput = {
      lots: [
        { ...mockInventoryLots[0], namaBarang: 'OrderNeededItem', skuId: 'SKU007', qtySistem: 20 },
      ],
      catalog: [
        { ...mockCatalogEntries[0], namaBarang: 'OrderNeededItem', skuId: 'SKU007', unitCost: 5, leadTimeDays: 5, safetyStockDays: 3 },
      ],
      ledger: generate30DaysLedger('OrderNeededItem', dailyUsage, 'L1'),
      entity: 'ALL',
    };
    const result1 = calculateInventoryMetrics(input1)[0];
    expect(result1.saranOrderQty).toBe(60);

    // Case 2: ROP <= currentStock (80 - 100 <= 0 -> 0)
    const input2: CalculatorInput = {
      lots: [
        { ...mockInventoryLots[0], namaBarang: 'NoOrderNeededItem', skuId: 'SKU008', qtySistem: 100 },
      ],
      catalog: [
        { ...mockCatalogEntries[0], namaBarang: 'NoOrderNeededItem', skuId: 'SKU008', unitCost: 5, leadTimeDays: 5, safetyStockDays: 3 },
      ],
      ledger: generate30DaysLedger('NoOrderNeededItem', dailyUsage, 'L2'),
      entity: 'ALL',
    };
    const result2 = calculateInventoryMetrics(input2)[0];
    expect(result2.saranOrderQty).toBe(0);
  });

  // 5. Status transitions (KRITIS / AMAN / OVERSTOCK)
  it('should transition status correctly between KRITIS, AMAN, and OVERSTOCK', () => {
    const dailyUsage = 2;
    const baseInput: CalculatorInput = {
      lots: [
        { ...mockInventoryLots[0], namaBarang: 'StatusItem', skuId: 'SKU009', qtySistem: 10 },
      ],
      catalog: [
        { ...mockCatalogEntries[0], namaBarang: 'StatusItem', skuId: 'SKU009', unitCost: 5, leadTimeDays: 10, safetyStockDays: 5 },
      ],
      ledger: generate30DaysLedger('StatusItem', dailyUsage, 'L3'),
      entity: 'ALL',
    };

    // Scenario 1: KRITIS (stock = 10, doi = 5, coverage = -5)
    const resultKritis = calculateInventoryMetrics(baseInput)[0];
    expect(resultKritis.status).toBe('KRITIS');
    expect(resultKritis.coverageDays).toBeLessThan(0);

    // Scenario 2: AMAN (stock = 50, doi = 25, coverage = 15 <= 30)
    const inputAman = { ...baseInput, lots: [{ ...baseInput.lots[0], qtySistem: 50 }] };
    const resultAman = calculateInventoryMetrics(inputAman)[0];
    expect(resultAman.status).toBe('AMAN');
    expect(resultAman.coverageDays).toBeGreaterThanOrEqual(0);
    expect(resultAman.coverageDays).toBeLessThanOrEqual(resultAman.leadTimeDays * 3);

    // Scenario 3: OVERSTOCK (stock = 90, doi = 45, coverage = 35 > 30)
    const inputOverstock = { ...baseInput, lots: [{ ...baseInput.lots[0], qtySistem: 90 }] };
    const resultOverstock = calculateInventoryMetrics(inputOverstock)[0];
    expect(resultOverstock.status).toBe('OVERSTOCK');
    expect(resultOverstock.coverageDays).toBeGreaterThan(resultOverstock.leadTimeDays * 3);
  });

  // 6. Forecast calculation
  it('should calculate forecast correctly (WMA-5m and SIMPLE-AVG)', () => {
    const today = new Date();

    // 6a: WMA with 5 months
    const wmaSkuName = 'ForecastWMAItem';
    const wmaLedgerEntries: LedgerEntry[] = [];
    let recordIdCounter = 1;
    const monthlyTotals = [100, 120, 140, 160, 180];
    for (let i = 4; i >= 0; i--) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 15);
      wmaLedgerEntries.push({
        recordId: `L-WMA-${recordIdCounter++}`,
        timestamp: monthStart.toISOString(),
        skuName: wmaSkuName,
        rackId: 'R1',
        qtyIn: -monthlyTotals[4 - i],
        expiredDate: '',
        sjNumber: `SJ-${recordIdCounter}`,
        remarks: 'Sold',
        entitas: 'BBB'
      });
    }

    const wmaInput: CalculatorInput = {
      lots: [{ ...mockInventoryLots[0], namaBarang: wmaSkuName, skuId: 'SKU-WMA' }],
      catalog: [{ ...mockCatalogEntries[0], namaBarang: wmaSkuName, skuId: 'SKU-WMA', unitCost: 1, leadTimeDays: 5, safetyStockDays: 3 }],
      ledger: wmaLedgerEntries,
      entity: 'ALL',
    };

    const resultWMA = calculateInventoryMetrics(wmaInput)[0];
    expect(resultWMA.forecastMethod).toBe('WMA-5m');
    expect(resultWMA.forecastStatus).toBe('OK');
    expect(resultWMA.forecastPerDay).toBeCloseTo(153.333 / 30);
    expect(resultWMA.forecast30d).toBeCloseTo(153.333);

    // 6b: SIMPLE-AVG with < 3 months data
    const simpleSkuName = 'ForecastSimpleItem';
    const simpleLedgerEntries: LedgerEntry[] = [];
    recordIdCounter = 1;
    const lowDataTotals = [100, 120];
    for (let i = 1; i >= 0; i--) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 15);
      simpleLedgerEntries.push({
        recordId: `L-SIM-${recordIdCounter++}`,
        timestamp: monthStart.toISOString(),
        skuName: simpleSkuName,
        rackId: 'R1',
        qtyIn: -lowDataTotals[1 - i],
        expiredDate: '',
        sjNumber: `SJ-${recordIdCounter}`,
        remarks: 'Sold',
        entitas: 'BBB'
      });
    }

    const simpleInput: CalculatorInput = {
      lots: [{ ...mockInventoryLots[0], namaBarang: simpleSkuName, skuId: 'SKU-SIMPLE' }],
      catalog: [{ ...mockCatalogEntries[0], namaBarang: simpleSkuName, skuId: 'SKU-SIMPLE', unitCost: 1, leadTimeDays: 5, safetyStockDays: 3 }],
      ledger: simpleLedgerEntries,
      entity: 'ALL',
    };
    const resultLowData = calculateInventoryMetrics(simpleInput)[0];
    expect(resultLowData.forecastMethod).toBe('SIMPLE-AVG');
    expect(resultLowData.forecastStatus).toBe('LOW_DATA');
    expect(resultLowData.forecastPerDay).toBeCloseTo(110 / 30);
    expect(resultLowData.forecast30d).toBeCloseTo(110);
  });

  // 7. Filtering by entity
  it('should filter by entity correctly', () => {
    const input: CalculatorInput = {
      lots: mockInventoryLots,
      catalog: mockCatalogEntries,
      ledger: [
        { recordId: 'L1', timestamp: daysAgo(1), skuName: 'Apple', rackId: 'R1', qtyIn: -5, expiredDate: '', sjNumber: '', remarks: '', entitas: 'BBB' },
        { recordId: 'L2', timestamp: daysAgo(1), skuName: 'Banana', rackId: 'R4', qtyIn: -10, expiredDate: '', sjNumber: '', remarks: '', entitas: 'BBB' },
        { recordId: 'L3', timestamp: daysAgo(1), skuName: 'Orange', rackId: 'R5', qtyIn: -5, expiredDate: '', sjNumber: '', remarks: '', entitas: 'BBT' },
        { recordId: 'L4', timestamp: daysAgo(1), skuName: 'Grapes', rackId: 'R6', qtyIn: -2, expiredDate: '', sjNumber: '', remarks: '', entitas: 'BBB' },
      ],
      entity: 'BBB',
    };
    const results = calculateInventoryMetrics(input);
    expect(results.length).toBe(3); // Apple, Banana, Grapes
    expect(results.find(r => r.skuName === 'Apple')).toBeDefined();
    expect(results.find(r => r.skuName === 'Banana')).toBeDefined();
    expect(results.find(r => r.skuName === 'Orange')).toBeUndefined();
    expect(results.find(r => r.skuName === 'Grapes')).toBeDefined();
  });
});

console.log(`\n========================================`);
console.log(`Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
console.log(`========================================\n`);

if (failedCount > 0) {
  process.exit(1);
}
