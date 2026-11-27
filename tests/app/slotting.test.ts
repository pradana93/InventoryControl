// tests/app/slotting.test.ts
import {
  computeAbcClassification,
  computeSlottingRecommendations,
  ABC_ZONE,
  ABC_PRIORITY,
} from '@/app/warehouse-optimization/slotting/SlottingClient';
import type {
  AbcClassificationResult,
  SkuLifecycleItem,
} from '@/app/warehouse-optimization/slotting/SlottingClient';
import type { InventoryLot, LedgerEntry } from '@/lib/db';

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
      if (a !== b) throw new Error(`Expected ${b}, received ${a}`);
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

function makeLedger(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    recordId: 'L1',
    timestamp: daysAgo(10),
    skuName: 'Apple',
    rackId: 'R01',
    qtyIn: -10,
    expiredDate: '',
    sjNumber: 'SJ-1',
    remarks: 'Outbound',
    entitas: 'BBB',
    ...overrides,
  };
}

function makeSku(overrides: Partial<SkuLifecycleItem> = {}): SkuLifecycleItem {
  return {
    skuId: 'SKU001',
    namaBarang: 'Apple',
    entitas: 'BBB',
    activeFlag: true,
    currentStock: 100,
    inventoryValue: 1000,
    status: 'Aktif',
    ...overrides,
  };
}

function makeLot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    nomorRak: 'R01',
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

// ---------------------------------------------------------------------------
// computeAbcClassification
// ---------------------------------------------------------------------------
describe('computeAbcClassification', () => {
  it('only counts outbound entries (qtyIn < 0) in the window', () => {
    const ledger = [
      makeLedger({ skuName: 'Apple', qtyIn: -100, recordId: 'L1' }),
      makeLedger({ skuName: 'Apple', qtyIn: 500, recordId: 'L2' }), // inbound ignored
      makeLedger({ skuName: 'Apple', qtyIn: -50, timestamp: daysAgo(200), recordId: 'L3' }), // outside window
    ];
    const result = computeAbcClassification(ledger, 90);
    expect(result.length).toBe(1);
    expect(result[0].skuName).toBe('Apple');
    expect(result[0].volume).toBe(100);
  });

  it('sums abs(qty) per SKU', () => {
    const ledger = [
      makeLedger({ skuName: 'Apple', qtyIn: -30, recordId: 'L1' }),
      makeLedger({ skuName: 'Apple', qtyIn: -20, recordId: 'L2' }),
    ];
    const result = computeAbcClassification(ledger, 90);
    expect(result[0].volume).toBe(50);
  });

  it('sorts descending by volume', () => {
    const ledger = [
      makeLedger({ skuName: 'Small', qtyIn: -10, recordId: 'L1' }),
      makeLedger({ skuName: 'Big', qtyIn: -100, recordId: 'L2' }),
    ];
    const result = computeAbcClassification(ledger, 90);
    expect(result[0].skuName).toBe('Big');
    expect(result[1].skuName).toBe('Small');
  });

  it('classifies cumulative <=80% as A, <=95% as B, else C', () => {
    // Volumes: A1=80, A2=10, B=5, C=5 -> total 100
    // A1 cumulative 80% -> A; A2 cumulative 90% -> B; B cumulative 95% -> B; C cumulative 100% -> C
    const ledger = [
      makeLedger({ skuName: 'A1', qtyIn: -80, recordId: 'L1' }),
      makeLedger({ skuName: 'A2', qtyIn: -10, recordId: 'L2' }),
      makeLedger({ skuName: 'B1', qtyIn: -5, recordId: 'L3' }),
      makeLedger({ skuName: 'C1', qtyIn: -5, recordId: 'L4' }),
    ];
    const result = computeAbcClassification(ledger, 90);
    expect(result.find((r) => r.skuName === 'A1')!.classification).toBe('A');
    expect(result.find((r) => r.skuName === 'A2')!.classification).toBe('B');
    expect(result.find((r) => r.skuName === 'B1')!.classification).toBe('B');
    expect(result.find((r) => r.skuName === 'C1')!.classification).toBe('C');
  });

  it('assigns a single SKU carrying all volume to class A', () => {
    const ledger = [makeLedger({ skuName: 'Only', qtyIn: -10, recordId: 'L1' })];
    const result = computeAbcClassification(ledger, 90);
    expect(result[0].classification).toBe('A');
  });

  it('returns an empty array when there is no outbound activity', () => {
    const ledger = [makeLedger({ skuName: 'Apple', qtyIn: 100, recordId: 'L1' })];
    expect(computeAbcClassification(ledger, 90).length).toBe(0);
    expect(computeAbcClassification([], 90).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeSlottingRecommendations and zone mapping
// ---------------------------------------------------------------------------
describe('computeSlottingRecommendations', () => {
  const classifications: AbcClassificationResult[] = [
    { skuName: 'Fast', entitas: 'BBB', classification: 'A', volume: 500 },
    { skuName: 'Medium', entitas: 'BBB', classification: 'B', volume: 100 },
    { skuName: 'Slow', entitas: 'BBB', classification: 'C', volume: 5 },
  ];

  it('maps zones: A -> RAK-BAWAH, B -> RAK-TENGAH, C -> RAK-ATAS', () => {
    expect(ABC_ZONE.A).toBe('RAK-BAWAH');
    expect(ABC_ZONE.B).toBe('RAK-TENGAH');
    expect(ABC_ZONE.C).toBe('RAK-ATAS');

    const activeSkus = [
      makeSku({ skuId: 'S1', namaBarang: 'Fast' }),
      makeSku({ skuId: 'S2', namaBarang: 'Medium' }),
      makeSku({ skuId: 'S3', namaBarang: 'Slow' }),
    ];
    const lots = [
      makeLot({ namaBarang: 'Fast', nomorRak: 'R10' }),
      makeLot({ namaBarang: 'Medium', nomorRak: 'R20' }),
      makeLot({ namaBarang: 'Slow', nomorRak: 'R30' }),
    ];
    const result = computeSlottingRecommendations(activeSkus, classifications, lots);

    expect(result.find((r) => r.skuName === 'Fast')!.suggestedRak).toBe('RAK-BAWAH');
    expect(result.find((r) => r.skuName === 'Medium')!.suggestedRak).toBe('RAK-TENGAH');
    expect(result.find((r) => r.skuName === 'Slow')!.suggestedRak).toBe('RAK-ATAS');
  });

  it('assigns priority scores A=1, B=2, C=3', () => {
    expect(ABC_PRIORITY.A).toBe(1);
    expect(ABC_PRIORITY.B).toBe(2);
    expect(ABC_PRIORITY.C).toBe(3);

    const activeSkus = [makeSku({ skuId: 'S1', namaBarang: 'Fast' })];
    const result = computeSlottingRecommendations(activeSkus, classifications, []);
    expect(result[0].priorityScore).toBe(1);
  });

  it('reads currentRak from the first lot, falling back to em dash', () => {
    const activeSkus = [
      makeSku({ skuId: 'S1', namaBarang: 'Fast' }),
      makeSku({ skuId: 'S2', namaBarang: 'NoLot' }),
    ];
    const lots = [makeLot({ namaBarang: 'Fast', nomorRak: 'R55' })];
    const result = computeSlottingRecommendations(activeSkus, classifications, lots);
    expect(result.find((r) => r.skuName === 'Fast')!.currentRak).toBe('R55');
    expect(result.find((r) => r.skuName === 'NoLot')!.currentRak).toBe('—');
  });

  it('defaults unclassified SKUs to class C', () => {
    const activeSkus = [makeSku({ skuId: 'S9', namaBarang: 'Unknown' })];
    const result = computeSlottingRecommendations(activeSkus, classifications, []);
    expect(result[0].classification).toBe('C');
    expect(result[0].suggestedRak).toBe('RAK-ATAS');
  });

  it('computes daysSinceLastOutbound from the latest ledger entry', () => {
    const activeSkus = [makeSku({ skuId: 'S1', namaBarang: 'Fast' })];
    const ledger = [
      makeLedger({ skuName: 'Fast', qtyIn: -10, timestamp: daysAgo(30), recordId: 'L1' }),
      makeLedger({ skuName: 'Fast', qtyIn: -10, timestamp: daysAgo(7), recordId: 'L2' }),
    ];
    const result = computeSlottingRecommendations(activeSkus, classifications, [], ledger);
    expect(result[0].daysSinceLastOutbound).toBe(7);
  });

  it("returns 'N/A' when there is no ledger history", () => {
    const activeSkus = [makeSku({ skuId: 'S1', namaBarang: 'Fast' })];
    const result = computeSlottingRecommendations(activeSkus, classifications, [], []);
    expect(result[0].daysSinceLastOutbound).toBe('N/A');
  });

  it('sorts results by priority score ascending', () => {
    const activeSkus = [
      makeSku({ skuId: 'S3', namaBarang: 'Slow' }),
      makeSku({ skuId: 'S1', namaBarang: 'Fast' }),
      makeSku({ skuId: 'S2', namaBarang: 'Medium' }),
    ];
    const result = computeSlottingRecommendations(activeSkus, classifications, []);
    expect(result[0].skuName).toBe('Fast');
    expect(result[1].skuName).toBe('Medium');
    expect(result[2].skuName).toBe('Slow');
  });
});

console.log(`\n========================================`);
console.log(`Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
console.log(`========================================\n`);

if (failedCount > 0) {
  process.exit(1);
}
