// tests/app/reports.test.ts
import {
  computeValuation,
  computeSlowMoving,
  computeVelocity,
} from '@/app/reports/ReportsClient';
import type { CatalogEntry, InventoryLot, LedgerEntry } from '@/lib/db';

// ---------------------------------------------------------------------------
// Tiny self-contained test harness
// ---------------------------------------------------------------------------
let passedCount = 0;
let failedCount = 0;

function describe(name: string, fn: () => void) {
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
    toEqual(expected: any) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected ${b}, received ${a}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeCloseTo(expected: number, digits = 2) {
      const factor = Math.pow(10, digits);
      if (Math.round(actual * factor) !== Math.round(expected * factor)) {
        throw new Error(`Expected ${actual} to be close to ${expected}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
function makeLot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    nomorRak: 'R1',
    namaBarang: 'Apple',
    qtySistem: 100,
    tanggalInbound: '2026-01-01',
    tanggalExpired: '2027-01-01',
    expiredLabel: 'OK',
    daysToExpiry: 365,
    soh: 100,
    variance: 0,
    akurasi: 100,
    statusFefo: 'OK',
    urutanFefo: 1,
    stockPicking: 0,
    barcode: '12345',
    category: 'Fruit',
    unit: 'pcs',
    skuId: 'SKU001',
    jenisLokasi: 'RACKING',
    entitas: 'BBB',
    ...overrides,
  };
}

function makeCatalog(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    skuId: 'SKU001',
    namaBarang: 'Apple',
    satuan: 'pcs',
    kategori: 'Fruit',
    status: 'Active',
    entitas: 'BBB',
    barcode: '12345',
    unitCost: 10,
    leadTimeDays: 5,
    safetyStockDays: 3,
    ...overrides,
  };
}

function makeLedger(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    recordId: 'L1',
    timestamp: new Date('2026-11-20T00:00:00Z').toISOString(),
    skuName: 'Apple',
    rackId: 'R1',
    qtyIn: -10,
    expiredDate: '',
    sjNumber: 'SJ-1',
    remarks: 'Outbound',
    entitas: 'BBB',
    ...overrides,
  };
}

const NOW = new Date('2026-11-27T00:00:00Z');
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86400000).toISOString();

// ---------------------------------------------------------------------------
// computeValuation
// ---------------------------------------------------------------------------
describe('computeValuation', () => {
  it('groups catalog SKUs by kategori and entitas', () => {
    const catalog = [
      makeCatalog({ namaBarang: 'Apple', kategori: 'Fruit', entitas: 'BBB', unitCost: 10 }),
      makeCatalog({ namaBarang: 'Banana', kategori: 'Fruit', entitas: 'BBB', unitCost: 5 }),
      makeCatalog({ namaBarang: 'Carrot', kategori: 'Veg', entitas: 'BBB', unitCost: 2 }),
    ];
    const lots = [
      makeLot({ namaBarang: 'Apple', qtySistem: 10 }),
      makeLot({ namaBarang: 'Banana', qtySistem: 4 }),
      makeLot({ namaBarang: 'Carrot', qtySistem: 100 }),
    ];
    const result = computeValuation(lots, catalog);
    expect(result.length).toBe(2);

    const fruit = result.find((g) => g.kategori === 'Fruit')!;
    expect(fruit.skuCount).toBe(2);
    expect(fruit.totalQty).toBe(14);
    expect(fruit.totalValue).toBe(120); // 10*10 + 4*5
    expect(fruit.skus.length).toBe(2);
  });

  it('separates groups of the same kategori by entitas', () => {
    const catalog = [
      makeCatalog({ namaBarang: 'Apple', kategori: 'Fruit', entitas: 'BBB' }),
      makeCatalog({ namaBarang: 'Apple BBT', kategori: 'Fruit', entitas: 'BBT' }),
    ];
    const lots = [
      makeLot({ namaBarang: 'Apple', qtySistem: 10 }),
      makeLot({ namaBarang: 'Apple BBT', qtySistem: 10, entitas: 'BBT' }),
    ];
    const result = computeValuation(lots, catalog);
    expect(result.length).toBe(2);
  });

  it('includes groups with zero quantity', () => {
    const catalog = [makeCatalog({ namaBarang: 'Ghost', kategori: 'GhostCat', unitCost: 100 })];
    const result = computeValuation([], catalog);
    expect(result.length).toBe(1);
    expect(result[0].totalQty).toBe(0);
    expect(result[0].totalValue).toBe(0);
    expect(result[0].skuCount).toBe(1);
  });

  it('only counts lots with qtySistem > 0', () => {
    const catalog = [makeCatalog({ namaBarang: 'Apple', unitCost: 10 })];
    const lots = [
      makeLot({ namaBarang: 'Apple', qtySistem: 10 }),
      makeLot({ namaBarang: 'Apple', qtySistem: -5 }),
      makeLot({ namaBarang: 'Apple', qtySistem: 0 }),
    ];
    const result = computeValuation(lots, catalog);
    expect(result[0].totalQty).toBe(10);
    expect(result[0].totalValue).toBe(100);
  });

  it('sorts groups by total value descending', () => {
    const catalog = [
      makeCatalog({ namaBarang: 'Small', kategori: 'A', unitCost: 1 }),
      makeCatalog({ namaBarang: 'Big', kategori: 'B', unitCost: 100 }),
    ];
    const lots = [
      makeLot({ namaBarang: 'Small', qtySistem: 1 }),
      makeLot({ namaBarang: 'Big', qtySistem: 10 }),
    ];
    const result = computeValuation(lots, catalog);
    expect(result[0].kategori).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// computeSlowMoving
// ---------------------------------------------------------------------------
describe('computeSlowMoving', () => {
  it('flags items with zero usage and positive stock', () => {
    const catalog = [makeCatalog({ namaBarang: 'Dead', unitCost: 10 })];
    const lots = [makeLot({ namaBarang: 'Dead', qtySistem: 50 })];
    const ledger = [makeLedger({ skuName: 'Dead', qtyIn: 50, timestamp: daysAgo(200) })];
    const result = computeSlowMoving(lots, catalog, ledger, NOW);
    expect(result.length).toBe(1);
    expect(result[0].currentStock).toBe(50);
    expect(result[0].inventoryValue).toBe(500);
  });

  it('excludes items that have recent outbound usage', () => {
    const catalog = [makeCatalog({ namaBarang: 'Active' })];
    const lots = [makeLot({ namaBarang: 'Active', qtySistem: 50 })];
    const ledger = [makeLedger({ skuName: 'Active', qtyIn: -5, timestamp: daysAgo(2) })];
    const result = computeSlowMoving(lots, catalog, ledger, NOW);
    expect(result.length).toBe(0);
  });

  it('excludes items with zero stock', () => {
    const catalog = [makeCatalog({ namaBarang: 'Empty' })];
    const result = computeSlowMoving([], catalog, [], NOW);
    expect(result.length).toBe(0);
  });

  it('computes lastMovement and daysSinceMovement from latest ledger entry', () => {
    const catalog = [makeCatalog({ namaBarang: 'Old', unitCost: 1 })];
    const lots = [makeLot({ namaBarang: 'Old', qtySistem: 5 })];
    const ledger = [
      makeLedger({ skuName: 'Old', qtyIn: 5, timestamp: daysAgo(100), recordId: 'L1' }),
      makeLedger({ skuName: 'Old', qtyIn: 5, timestamp: daysAgo(40), recordId: 'L2' }),
    ];
    const result = computeSlowMoving(lots, catalog, ledger, NOW);
    expect(result[0].daysSinceMovement).toBe(40);
    expect(result[0].lastMovement).toBe(daysAgo(40).slice(0, 10));
  });

  it("returns 'Tidak Ada' and 'N/A' when there is no movement history", () => {
    const catalog = [makeCatalog({ namaBarang: 'NoHist' })];
    const lots = [makeLot({ namaBarang: 'NoHist', qtySistem: 5 })];
    const result = computeSlowMoving(lots, catalog, [], NOW);
    expect(result[0].lastMovement).toBe('Tidak Ada');
    expect(result[0].daysSinceMovement).toBe('N/A');
    expect(result[0].deadStock).toBe(false);
  });

  it('flags dead stock when daysSinceMovement > 60', () => {
    const catalog = [makeCatalog({ namaBarang: 'Dead' })];
    const lots = [makeLot({ namaBarang: 'Dead', qtySistem: 5 })];
    const ledger = [makeLedger({ skuName: 'Dead', qtyIn: 5, timestamp: daysAgo(61) })];
    const result = computeSlowMoving(lots, catalog, ledger, NOW);
    expect(result[0].deadStock).toBe(true);
  });

  it('does not flag dead stock at exactly 60 days', () => {
    const catalog = [makeCatalog({ namaBarang: 'Borderline' })];
    const lots = [makeLot({ namaBarang: 'Borderline', qtySistem: 5 })];
    const ledger = [makeLedger({ skuName: 'Borderline', qtyIn: 5, timestamp: daysAgo(60) })];
    const result = computeSlowMoving(lots, catalog, ledger, NOW);
    expect(result[0].deadStock).toBe(false);
  });

  it('sorts by daysSinceMovement descending', () => {
    const catalog = [
      makeCatalog({ namaBarang: 'A' }),
      makeCatalog({ namaBarang: 'B' }),
    ];
    const lots = [
      makeLot({ namaBarang: 'A', qtySistem: 5 }),
      makeLot({ namaBarang: 'B', qtySistem: 5 }),
    ];
    const ledger = [
      makeLedger({ skuName: 'A', qtyIn: 5, timestamp: daysAgo(10) }),
      makeLedger({ skuName: 'B', qtyIn: 5, timestamp: daysAgo(90) }),
    ];
    const result = computeSlowMoving(lots, catalog, ledger, NOW);
    expect(result[0].skuName).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// computeVelocity
// ---------------------------------------------------------------------------
describe('computeVelocity', () => {
  it('only includes SKUs with avgDailyUsage > 0', () => {
    const catalog = [
      makeCatalog({ namaBarang: 'Moving' }),
      makeCatalog({ namaBarang: 'Static' }),
    ];
    const lots = [
      makeLot({ namaBarang: 'Moving', qtySistem: 30 }),
      makeLot({ namaBarang: 'Static', qtySistem: 30 }),
    ];
    const ledger = [makeLedger({ skuName: 'Moving', qtyIn: -30, timestamp: daysAgo(5) })];
    const result = computeVelocity(lots, catalog, ledger, NOW);
    expect(result.length).toBe(1);
    expect(result[0].skuName).toBe('Moving');
  });

  it('computes avgDailyUsage as 30-day outbound / 30', () => {
    const catalog = [makeCatalog({ namaBarang: 'Apple' })];
    const lots = [makeLot({ namaBarang: 'Apple', qtySistem: 30 })];
    const ledger = [makeLedger({ skuName: 'Apple', qtyIn: -30, timestamp: daysAgo(5) })];
    const result = computeVelocity(lots, catalog, ledger, NOW);
    expect(result[0].avgDailyUsage).toBe(1);
  });

  it('computes daysOfCover as currentStock / avgDailyUsage', () => {
    const catalog = [makeCatalog({ namaBarang: 'Apple' })];
    const lots = [makeLot({ namaBarang: 'Apple', qtySistem: 30 })];
    const ledger = [makeLedger({ skuName: 'Apple', qtyIn: -30, timestamp: daysAgo(5) })];
    const result = computeVelocity(lots, catalog, ledger, NOW);
    expect(result[0].daysOfCover).toBe(30);
  });

  it('marks trend UP when last 7 days exceed prior 7 days', () => {
    const catalog = [makeCatalog({ namaBarang: 'Apple' })];
    const lots = [makeLot({ namaBarang: 'Apple', qtySistem: 100 })];
    const ledger = [
      makeLedger({ skuName: 'Apple', qtyIn: -20, timestamp: daysAgo(3), recordId: 'L1' }), // last 7
      makeLedger({ skuName: 'Apple', qtyIn: -5, timestamp: daysAgo(10), recordId: 'L2' }), // prior 7
    ];
    const result = computeVelocity(lots, catalog, ledger, NOW);
    expect(result[0].trend).toBe('UP');
  });

  it('marks trend DOWN when last 7 days are below prior 7 days', () => {
    const catalog = [makeCatalog({ namaBarang: 'Apple' })];
    const lots = [makeLot({ namaBarang: 'Apple', qtySistem: 100 })];
    const ledger = [
      makeLedger({ skuName: 'Apple', qtyIn: -3, timestamp: daysAgo(2), recordId: 'L1' }),
      makeLedger({ skuName: 'Apple', qtyIn: -30, timestamp: daysAgo(9), recordId: 'L2' }),
    ];
    const result = computeVelocity(lots, catalog, ledger, NOW);
    expect(result[0].trend).toBe('DOWN');
  });

  it('marks trend FLAT when both windows are equal', () => {
    const catalog = [makeCatalog({ namaBarang: 'Apple' })];
    const lots = [makeLot({ namaBarang: 'Apple', qtySistem: 100 })];
    const ledger = [
      makeLedger({ skuName: 'Apple', qtyIn: -10, timestamp: daysAgo(3), recordId: 'L1' }),
      makeLedger({ skuName: 'Apple', qtyIn: -10, timestamp: daysAgo(10), recordId: 'L2' }),
    ];
    const result = computeVelocity(lots, catalog, ledger, NOW);
    expect(result[0].trend).toBe('FLAT');
  });

  it('sorts by daysOfCover ascending', () => {
    const catalog = [
      makeCatalog({ namaBarang: 'Slow', unitCost: 1 }),
      makeCatalog({ namaBarang: 'Fast', unitCost: 1 }),
    ];
    const lots = [
      makeLot({ namaBarang: 'Slow', qtySistem: 100 }),
      makeLot({ namaBarang: 'Fast', qtySistem: 10 }),
    ];
    const ledger = [
      makeLedger({ skuName: 'Slow', qtyIn: -10, timestamp: daysAgo(3), recordId: 'L1' }),
      makeLedger({ skuName: 'Fast', qtyIn: -30, timestamp: daysAgo(3), recordId: 'L2' }),
    ];
    const result = computeVelocity(lots, catalog, ledger, NOW);
    expect(result[0].skuName).toBe('Fast');
  });

  it('returns an empty array when there is no outbound activity', () => {
    const catalog = [makeCatalog({ namaBarang: 'Apple' })];
    const lots = [makeLot({ namaBarang: 'Apple', qtySistem: 100 })];
    expect(computeVelocity(lots, catalog, [], NOW).length).toBe(0);
  });
});

console.log(`\n========================================`);
console.log(`Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
console.log(`========================================\n`);

if (failedCount > 0) {
  process.exit(1);
}
