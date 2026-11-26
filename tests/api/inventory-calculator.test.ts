// tests/api/inventory-calculator.test.ts
// Integration test for GET /api/inventory/calculator
//
// The route module (`src/app/api/inventory/calculator/route.ts`) imports its data
// layer from `@/lib/db` and its calculator from `@/lib/inventory-calculator`. To
// keep this test hermetic (no Supabase connection, no env vars required) we seed
// Node's `require.cache` with mocks for those two modules BEFORE importing the
// route. This mirrors the self-contained harness used by
// `tests/lib/inventory-calculator.test.ts`.

import type { CatalogEntry, InventoryLot, LedgerEntry } from '@/lib/db';
import type { CalculatorResult } from '@/lib/inventory-calculator';

// ---------------------------------------------------------------------------
// Tiny self-contained test harness (matches tests/lib/inventory-calculator.test.ts)
// ---------------------------------------------------------------------------
let suiteName = '';
let passedCount = 0;
let failedCount = 0;

function describe(name: string, fn: () => void) {
  suiteName = name;
  console.log(`\n=== Suite: ${name} ===`);
  fn();
}

function it(name: string, fn: () => void | Promise<void>) {
  pending.push({ name, fn });
}

const pending: Array<{ name: string; fn: () => void | Promise<void> }> = [];

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
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined`);
      }
    },
    toContain(expected: any) {
      if (!Array.isArray(actual) || !actual.includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
const mockLots: InventoryLot[] = [
  {
    nomorRak: 'R1', namaBarang: 'Apple', qtySistem: 100, tanggalInbound: '2024-01-01',
    tanggalExpired: '2025-01-01', expiredLabel: 'OK', daysToExpiry: 365, soh: 100,
    variance: 0, akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 100,
    barcode: '12345', category: 'Fruit', unit: 'pcs', skuId: 'SKU001',
    jenisLokasi: 'FIFO', entitas: 'BBB',
  },
  {
    nomorRak: 'R2', namaBarang: 'Banana', qtySistem: 200, tanggalInbound: '2024-01-01',
    tanggalExpired: '2025-01-01', expiredLabel: 'OK', daysToExpiry: 365, soh: 200,
    variance: 0, akurasi: 100, statusFefo: 'OK', urutanFefo: 1, stockPicking: 200,
    barcode: '67890', category: 'Fruit', unit: 'pcs', skuId: 'SKU002',
    jenisLokasi: 'FIFO', entitas: 'BBB',
  },
];

const mockCatalog: CatalogEntry[] = [
  { skuId: 'SKU001', namaBarang: 'Apple', satuan: 'pcs', kategori: 'Fruit', status: 'Active', entitas: 'BBB', barcode: '12345', unitCost: 1.0, leadTimeDays: 5, safetyStockDays: 3 },
  { skuId: 'SKU002', namaBarang: 'Banana', satuan: 'pcs', kategori: 'Fruit', status: 'Active', entitas: 'BBB', barcode: '67890', unitCost: 0.5, leadTimeDays: 7, safetyStockDays: 4 },
];

const mockLedger: LedgerEntry[] = [
  { recordId: 'L1', timestamp: new Date().toISOString(), skuName: 'Apple', rackId: 'R1', qtyIn: -10, expiredDate: '', sjNumber: 'SJ-1', remarks: 'Outbound', entitas: 'BBB' },
  { recordId: 'L2', timestamp: new Date().toISOString(), skuName: 'Banana', rackId: 'R2', qtyIn: -20, expiredDate: '', sjNumber: 'SJ-2', remarks: 'Outbound', entitas: 'BBB' },
];

const mockResults: CalculatorResult[] = [
  {
    skuName: 'Apple', entitas: 'BBB', currentStock: 100, unitCost: 1.0, avgDailyUsage: 10,
    doi: 10, leadTimeDays: 5, safetyStockDays: 3, coverageDays: 5, status: 'AMAN',
    safetyStockQty: 30, ropQty: 80, saranOrderQty: 0, inventoryValue: 100,
    forecast30d: 300, forecastPerDay: 10, forecastStatus: 'OK', forecastMethod: 'WMA-5m',
  },
  {
    skuName: 'Banana', entitas: 'BBB', currentStock: 200, unitCost: 0.5, avgDailyUsage: 20,
    doi: 10, leadTimeDays: 7, safetyStockDays: 4, coverageDays: 3, status: 'AMAN',
    safetyStockQty: 80, ropQty: 220, saranOrderQty: 20, inventoryValue: 100,
    forecast30d: 600, forecastPerDay: 20, forecastStatus: 'OK', forecastMethod: 'WMA-5m',
  },
];

// ---------------------------------------------------------------------------
// Module mocks installed into the CommonJS require cache.
// ---------------------------------------------------------------------------
const calls = {
  getInventoryLots: 0,
  getCatalog: 0,
  getLedger: 0,
  calculateInventoryMetrics: [] as any[],
};

let shouldThrow = false;

function installMocks() {
  const dbExports = {
    getInventoryLots: async () => {
      calls.getInventoryLots++;
      if (shouldThrow) throw new Error('Database error');
      return mockLots;
    },
    getCatalog: async () => {
      calls.getCatalog++;
      if (shouldThrow) throw new Error('Database error');
      return mockCatalog;
    },
    getLedger: async () => {
      calls.getLedger++;
      if (shouldThrow) throw new Error('Database error');
      return mockLedger;
    },
  };

  const calcExports = {
    calculateInventoryMetrics(input: any) {
      calls.calculateInventoryMetrics.push(input);
      return mockResults;
    },
  };

  const dbPath = require.resolve('@/lib/db');
  const calcPath = require.resolve('@/lib/inventory-calculator');

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: dbExports,
  } as any;
  require.cache[calcPath] = {
    id: calcPath,
    filename: calcPath,
    loaded: true,
    exports: calcExports,
  } as any;
}

installMocks();

// Route is imported AFTER the mocks are installed.
const { GET } = require('@/app/api/inventory/calculator/route');

function makeRequest(query = ''): Request {
  return new Request(`http://localhost/api/inventory/calculator${query}`);
}

function resetCalls() {
  calls.getInventoryLots = 0;
  calls.getCatalog = 0;
  calls.getLedger = 0;
  calls.calculateInventoryMetrics = [];
  shouldThrow = false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/inventory/calculator', () => {
  it('defaults to ent=BBB and returns a JSON array of calculator results', async () => {
    resetCalls();
    const res = await GET(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(mockResults.length);
    expect(data[0].skuName).toBe('Apple');

    // Required result shape
    const keys = Object.keys(data[0]);
    for (const key of [
      'skuName', 'entitas', 'currentStock', 'unitCost', 'avgDailyUsage', 'doi',
      'leadTimeDays', 'safetyStockDays', 'coverageDays', 'status', 'safetyStockQty',
      'ropQty', 'saranOrderQty', 'inventoryValue', 'forecast30d', 'forecastPerDay',
      'forecastStatus', 'forecastMethod',
    ]) {
      expect(keys).toContain(key);
    }
  });

  it('fetches lots, catalog and ledger exactly once', async () => {
    resetCalls();
    await GET(makeRequest('?ent=BBB'));
    expect(calls.getInventoryLots).toBe(1);
    expect(calls.getCatalog).toBe(1);
    expect(calls.getLedger).toBe(1);
  });

  it('passes entity=BBB to the calculator', async () => {
    resetCalls();
    await GET(makeRequest('?ent=BBB'));
    const input = calls.calculateInventoryMetrics[0];
    expect(input.entity).toBe('BBB');
    expect(input.lots?.length).toBe(mockLots.length);
    expect(input.catalog?.length).toBe(mockCatalog.length);
    expect(input.ledger?.length).toBe(mockLedger.length);
  });

  it('honours ent=BBT', async () => {
    resetCalls();
    await GET(makeRequest('?ent=BBT'));
    expect(calls.calculateInventoryMetrics[0].entity).toBe('BBT');
  });

  it('falls back to BBB for invalid ent values', async () => {
    resetCalls();
    await GET(makeRequest('?ent=INVALID'));
    expect(calls.calculateInventoryMetrics[0].entity).toBe('BBB');
  });

  it('returns 500 when the data layer throws', async () => {
    resetCalls();
    shouldThrow = true;
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe('Gagal menghitung metrik inventori');
  });
});

// ---------------------------------------------------------------------------
// Run the queued tests
// ---------------------------------------------------------------------------
(async () => {
  for (const { name, fn } of pending) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passedCount++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}: ${err.message}`);
      failedCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log(`========================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
})();
