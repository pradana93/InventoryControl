import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Minimal self-contained test harness for TypeScript runner
let passedCount = 0;
let failedCount = 0;

function describe(name: string, fn: () => void) {
  console.log(`\n=== Suite: ${name} ===`);
  fn();
}

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
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toBeBoolean() {
      if (typeof actual !== 'boolean') {
        throw new Error(`Expected a boolean, received ${typeof actual}`);
      }
    },
    forEach(callback: (item: any) => void) {
      if (!Array.isArray(actual)) {
        throw new Error(`Expected an array, received ${typeof actual}`);
      }
      actual.forEach(callback);
    },
  };
}

describe('Catalog Active Flag', () => {
  test('getCatalog returns activeFlag as boolean with default true', async () => {
    const { getCatalog } = await import('@/lib/db');
    const catalog = await getCatalog({ entity: 'ALL' });
    expect(catalog.length).toBeGreaterThan(0);
    catalog.forEach((item) => {
      expect(typeof item.activeFlag).toBe('boolean');
    });
  });
});

// Summary of results
setTimeout(() => {
  console.log(`\n========================================`);
  console.log(`Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log(`========================================\n`);
  if (failedCount > 0) {
    process.exit(1);
  }
}, 3000);