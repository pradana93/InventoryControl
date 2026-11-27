// tests/lib/forecasting.test.ts
import { calculateExponentialSmoothingForecast, calculateDaysOfSupply } from '@/lib/forecasting';
import type { LedgerEntry } from '@/lib/db';

// Minimal test harness
let passedCount = 0;
let failedCount = 0;

function test(name: string, fn: () => Promise<void> | void) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  [PASS] ${name}`);
      passedCount++;
    })
    .catch((err: any) => {
      console.error(`  [FAIL] ${name}: ${err.message}`);
      failedCount++;
    });
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
      }
    },
    toBeCloseTo(expected: number, precision: number = 2) {
      const tolerance = Math.pow(10, -precision);
      if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`Expected ${expected}, got ${actual} (tolerance: ${tolerance})`);
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
  };
}

function createMockLedgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    recordId: `REC-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    skuName: 'Test SKU',
    rackId: 'RACK-001',
    qtyIn: -10,
    expiredDate: '2025-12-31',
    sjNumber: 'SJ-001',
    remarks: '',
    entitas: 'BBB',
    ...overrides,
  };
}

console.log('=== Suite: forecasting.ts ===');

test('exponential smoothing weights recent history', () => {
  // Create ledger entries with increasing demand over time
  // Older entries should have less weight than newer ones
  const baseDate = new Date('2024-01-01');
  
  const entries: LedgerEntry[] = [
    createMockLedgerEntry({
      timestamp: new Date(baseDate.getTime() + 0 * 86400000).toISOString(),
      qtyIn: -10, // Day 1: demand = 10
    }),
    createMockLedgerEntry({
      timestamp: new Date(baseDate.getTime() + 1 * 86400000).toISOString(),
      qtyIn: -20, // Day 2: demand = 20
    }),
    createMockLedgerEntry({
      timestamp: new Date(baseDate.getTime() + 2 * 86400000).toISOString(),
      qtyIn: -30, // Day 3: demand = 30
    }),
    createMockLedgerEntry({
      timestamp: new Date(baseDate.getTime() + 3 * 86400000).toISOString(),
      qtyIn: -40, // Day 4: demand = 40
    }),
    createMockLedgerEntry({
      timestamp: new Date(baseDate.getTime() + 4 * 86400000).toISOString(),
      qtyIn: -50, // Day 5: demand = 50 (most recent)
    }),
  ];

  // With alpha=0.3, recent values should have more influence
  // Manual calculation:
  // S1 = 10 (initial)
  // S2 = 0.3*20 + 0.7*10 = 6 + 7 = 13
  // S3 = 0.3*30 + 0.7*13 = 9 + 9.1 = 18.1
  // S4 = 0.3*40 + 0.7*18.1 = 12 + 12.67 = 24.67
  // S5 = 0.3*50 + 0.7*24.67 = 15 + 17.269 = 32.269
  // Forecast = 32.269
  // forecast30d = 32.269 * 30 = 968.07
  
  const result = calculateExponentialSmoothingForecast(entries, 0.3);
  
  expect(result.model).toBe('SES');
  expect(result.alpha).toBe(0.3);
  expect(result.forecastDaily).toBeCloseTo(32.27, 2);
  expect(result.forecast30d).toBeCloseTo(968.07, 2);
});

test('SES uses default alpha=0.3 when not provided', () => {
  const entries: LedgerEntry[] = [
    createMockLedgerEntry({ qtyIn: -10, timestamp: '2024-01-01T00:00:00Z' }),
    createMockLedgerEntry({ qtyIn: -20, timestamp: '2024-01-02T00:00:00Z' }),
  ];

  const result = calculateExponentialSmoothingForecast(entries);
  
  expect(result.alpha).toBe(0.3);
});

test('SES handles zero outbound gracefully', () => {
  // Only inbound entries (positive qtyIn)
  const entries: LedgerEntry[] = [
    createMockLedgerEntry({ qtyIn: 100, timestamp: '2024-01-01T00:00:00Z' }),
    createMockLedgerEntry({ qtyIn: 50, timestamp: '2024-01-02T00:00:00Z' }),
  ];

  const result = calculateExponentialSmoothingForecast(entries);
  
  expect(result.forecastDaily).toBe(0);
  expect(result.forecast30d).toBe(0);
  expect(result.model).toBe('SES');
});

test('SES handles empty ledger', () => {
  const result = calculateExponentialSmoothingForecast([]);
  
  expect(result.forecastDaily).toBe(0);
  expect(result.forecast30d).toBe(0);
  expect(result.model).toBe('SES');
});

test('SES only counts OUTBOUND (qtyIn < 0) as demand', () => {
  const entries: LedgerEntry[] = [
    createMockLedgerEntry({ qtyIn: -10, timestamp: '2024-01-01T00:00:00Z' }),  // outbound
    createMockLedgerEntry({ qtyIn: 100, timestamp: '2024-01-02T00:00:00Z' }),  // inbound (should be ignored)
    createMockLedgerEntry({ qtyIn: -20, timestamp: '2024-01-03T00:00:00Z' }),  // outbound
  ];

  // Should only use -10 and -20 (demand = 10, 20)
  // S1 = 10
  // S2 = 0.3*20 + 0.7*10 = 13
  const result = calculateExponentialSmoothingForecast(entries, 0.3);
  
  expect(result.forecastDaily).toBeCloseTo(13, 2);
});

test('SES sorts entries by date ascending before calculation', () => {
  // Provide entries out of order
  const entries: LedgerEntry[] = [
    createMockLedgerEntry({ qtyIn: -30, timestamp: '2024-01-03T00:00:00Z' }),  // newest
    createMockLedgerEntry({ qtyIn: -10, timestamp: '2024-01-01T00:00:00Z' }),  // oldest
    createMockLedgerEntry({ qtyIn: -20, timestamp: '2024-01-02T00:00:00Z' }),  // middle
  ];

  // After sorting: 10, 20, 30
  // S1 = 10
  // S2 = 0.3*20 + 0.7*10 = 13
  // S3 = 0.3*30 + 0.7*13 = 18.1
  const result = calculateExponentialSmoothingForecast(entries, 0.3);
  
  expect(result.forecastDaily).toBeCloseTo(18.1, 1);
});

test('DOS calculates days correctly without division by zero', () => {
  // Normal case
  expect(calculateDaysOfSupply(100, 10)).toBe(10.0);
  expect(calculateDaysOfSupply(50, 5)).toBe(10.0);
  expect(calculateDaysOfSupply(30, 2)).toBe(15.0);
  
  // Rounding to 1 decimal
  expect(calculateDaysOfSupply(100, 3)).toBe(33.3); // 33.33... -> 33.3
  expect(calculateDaysOfSupply(100, 7)).toBe(14.3); // 14.28... -> 14.3
});

test('DOS returns 999 (infinite) when forecastDaily <= 0', () => {
  expect(calculateDaysOfSupply(100, 0)).toBe(999);
  expect(calculateDaysOfSupply(100, -5)).toBe(999);
  expect(calculateDaysOfSupply(0, 0)).toBe(999);
  expect(calculateDaysOfSupply(0, -1)).toBe(999);
});

test('DOS with zero stock returns 0 when forecast > 0', () => {
  expect(calculateDaysOfSupply(0, 10)).toBe(0.0);
});

test('SES throws on invalid alpha', () => {
  const entries: LedgerEntry[] = [
    createMockLedgerEntry({ qtyIn: -10, timestamp: '2024-01-01T00:00:00Z' }),
  ];

  let threw = false;
  try {
    calculateExponentialSmoothingForecast(entries, 0);
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);

  threw = false;
  try {
    calculateExponentialSmoothingForecast(entries, 1.5);
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);

  threw = false;
  try {
    calculateExponentialSmoothingForecast(entries, -0.1);
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
});

test('SES alpha=1 gives weight only to most recent observation', () => {
  const entries: LedgerEntry[] = [
    createMockLedgerEntry({ qtyIn: -10, timestamp: '2024-01-01T00:00:00Z' }),
    createMockLedgerEntry({ qtyIn: -20, timestamp: '2024-01-02T00:00:00Z' }),
    createMockLedgerEntry({ qtyIn: -30, timestamp: '2024-01-03T00:00:00Z' }),
  ];

  // With alpha=1: S_t = Y_t (only most recent matters)
  // S1 = 10
  // S2 = 1*20 + 0*10 = 20
  // S3 = 1*30 + 0*20 = 30
  const result = calculateExponentialSmoothingForecast(entries, 1.0);
  
  expect(result.forecastDaily).toBe(30);
});

test('SES alpha close to 0 smooths heavily toward the initial seed value', () => {
  const entries: LedgerEntry[] = [
    createMockLedgerEntry({ qtyIn: -10, timestamp: '2024-01-01T00:00:00Z' }),
    createMockLedgerEntry({ qtyIn: -20, timestamp: '2024-01-02T00:00:00Z' }),
    createMockLedgerEntry({ qtyIn: -30, timestamp: '2024-01-03T00:00:00Z' }),
  ];

  // Seeded with S1 = 10 when alpha is tiny:
  // S2 = 0.01*20 + 0.99*10 = 0.2 + 9.9 = 10.1
  // S3 = 0.01*30 + 0.99*10.1 = 0.3 + 9.999 = 10.299
  const result = calculateExponentialSmoothingForecast(entries, 0.01);
  
  expect(result.forecastDaily).toBeCloseTo(10.3, 1);
});

// Summary of results
setTimeout(() => {
  console.log(`\n========================================`);
  console.log(`Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log(`========================================\n`);
  if (failedCount > 0) {
    process.exit(1);
  }
}, 1000);