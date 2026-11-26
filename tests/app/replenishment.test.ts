// tests/app/replenishment.test.ts
import { filterReplenishmentItems } from '@/app/replenishment/ReplenishmentClient';
import { CalculatorResult } from '@/lib/inventory-calculator';

// Minimal self-contained test harness for TypeScript runner
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
    toBeLessThan(expected: number) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined`);
      }
    },
  };
}

// Base factory for CalculatorResult with overridable fields.
function makeResult(overrides: Partial<CalculatorResult> = {}): CalculatorResult {
  return {
    skuName: 'Default SKU',
    entitas: 'BBB',
    currentStock: 100,
    unitCost: 10,
    avgDailyUsage: 5,
    doi: 20,
    leadTimeDays: 7,
    safetyStockDays: 3,
    coverageDays: 13,
    status: 'AMAN',
    safetyStockQty: 15,
    ropQty: 50,
    saranOrderQty: 0,
    inventoryValue: 1000,
    forecast30d: 150,
    forecastPerDay: 5,
    forecastStatus: 'OK',
    forecastMethod: 'WMA-5m',
    ...overrides,
  };
}

describe('filterReplenishmentItems', () => {

  // 1. Priority: KRITIS with doi < 1 => URGENT
  it('should mark KRITIS items with doi < 1 as URGENT', () => {
    const result = filterReplenishmentItems([
      makeResult({ skuName: 'Urgent', status: 'KRITIS', doi: 0.5, saranOrderQty: 10, unitCost: 100 }),
    ]);
    expect(result.length).toBe(1);
    expect(result[0].priority).toBe('URGENT');
  });

  // 2. Priority: KRITIS with doi >= 1 => HIGH
  it('should mark KRITIS items with doi >= 1 as HIGH', () => {
    const result = filterReplenishmentItems([
      makeResult({ skuName: 'High', status: 'KRITIS', doi: 2, saranOrderQty: 10, unitCost: 100 }),
    ]);
    expect(result[0].priority).toBe('HIGH');
  });

  // 3. Priority: saranOrderQty > 0 (not KRITIS) => NORMAL
  it('should mark non-KRITIS items with saranOrderQty > 0 as NORMAL', () => {
    const result = filterReplenishmentItems([
      makeResult({ skuName: 'Normal', status: 'AMAN', doi: 10, saranOrderQty: 5, unitCost: 20 }),
    ]);
    expect(result[0].priority).toBe('NORMAL');
  });

  // 4. Items with no order and not KRITIS are filtered out
  it('should exclude items that need no order and are not KRITIS', () => {
    const result = filterReplenishmentItems([
      makeResult({ skuName: 'Safe', status: 'AMAN', saranOrderQty: 0 }),
      makeResult({ skuName: 'Overstocked', status: 'OVERSTOCK', saranOrderQty: 0 }),
    ]);
    expect(result.length).toBe(0);
  });

  // 5. KRITIS items are kept even when saranOrderQty is 0
  it('should keep KRITIS items even when saranOrderQty is 0', () => {
    const result = filterReplenishmentItems([
      makeResult({ skuName: 'KeepMe', status: 'KRITIS', doi: 0.5, saranOrderQty: 0 }),
    ]);
    expect(result.length).toBe(1);
    expect(result[0].priority).toBe('URGENT');
  });

  // 6. Derived saranValue = saranOrderQty * unitCost
  it('should compute saranValue as saranOrderQty * unitCost', () => {
    const result = filterReplenishmentItems([
      makeResult({ skuName: 'Val', status: 'AMAN', saranOrderQty: 12, unitCost: 2500 }),
    ]);
    expect(result[0].saranValue).toBe(30000);
  });

  // 7. Sort: URGENT before HIGH before NORMAL
  it('should order URGENT before HIGH before NORMAL', () => {
    const items = [
      makeResult({ skuName: 'N', status: 'AMAN', saranOrderQty: 1, unitCost: 1 }),
      makeResult({ skuName: 'H', status: 'KRITIS', doi: 2, saranOrderQty: 1, unitCost: 1 }),
      makeResult({ skuName: 'U', status: 'KRITIS', doi: 0.5, saranOrderQty: 1, unitCost: 1 }),
    ];
    const result = filterReplenishmentItems(items);
    expect(result.map((r) => r.priority)).toEqual(['URGENT', 'HIGH', 'NORMAL']);
  });

  // 8. Sort within priority: saranValue descending
  it('should sort by saranValue descending within the same priority', () => {
    const items = [
      makeResult({ skuName: 'Small', status: 'AMAN', saranOrderQty: 5, unitCost: 100 }),   // 500
      makeResult({ skuName: 'Big', status: 'AMAN', saranOrderQty: 50, unitCost: 100 }),    // 5000
      makeResult({ skuName: 'Mid', status: 'AMAN', saranOrderQty: 20, unitCost: 100 }),    // 2000
    ];
    const result = filterReplenishmentItems(items);
    expect(result.map((r) => r.skuName)).toEqual(['Big', 'Mid', 'Small']);
  });

  // 9. Combined sorting across priorities and values
  it('should combine priority and value sorting correctly', () => {
    const items = [
      makeResult({ skuName: 'NormalBig', status: 'AMAN', saranOrderQty: 100, unitCost: 1000 }),      // NORMAL, 100000
      makeResult({ skuName: 'HighSmall', status: 'KRITIS', doi: 3, saranOrderQty: 1, unitCost: 100 }), // HIGH, 100
      makeResult({ skuName: 'UrgentSmall', status: 'KRITIS', doi: 0.2, saranOrderQty: 1, unitCost: 100 }), // URGENT, 100
    ];
    const result = filterReplenishmentItems(items);
    expect(result.map((r) => r.skuName)).toEqual(['UrgentSmall', 'HighSmall', 'NormalBig']);
  });

  // 10. Empty input
  it('should return an empty array for empty input', () => {
    expect(filterReplenishmentItems([]).length).toBe(0);
  });

  // 11. Preserves source fields on the output items
  it('should preserve original CalculatorResult fields', () => {
    const source = makeResult({
      skuName: 'Preserve',
      entitas: 'BBT',
      status: 'KRITIS',
      doi: 0.4,
      saranOrderQty: 8,
      unitCost: 500,
      ropQty: 40,
      currentStock: 32,
    });
    const result = filterReplenishmentItems([source]);
    expect(result[0].skuName).toBe('Preserve');
    expect(result[0].entitas).toBe('BBT');
    expect(result[0].ropQty).toBe(40);
    expect(result[0].currentStock).toBe(32);
    expect(result[0].priority).toBe('URGENT');
    expect(result[0].saranValue).toBe(4000);
  });
});

console.log(`\n========================================`);
console.log(`Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
console.log(`========================================\n`);

if (failedCount > 0) {
  process.exit(1);
}