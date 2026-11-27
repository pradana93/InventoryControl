
import { filterActiveSkus } from '@/lib/warehouse-optimization';

// ---------------------------------------------------------------------------
// Tiny test harness
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
    toEqual(expected: any) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`Expected ${b}, received ${a}`);
    },
  };
}

interface TestItem {
  id: number;
  activeFlag?: boolean;
}

describe('warehouse-optimization utility', () => {
  it('filters out items with activeFlag === false', () => {
    const items: TestItem[] = [
      { id: 1, activeFlag: true },
      { id: 2, activeFlag: false },
    ];
    const result = filterActiveSkus(items);
    expect(result).toEqual([{ id: 1, activeFlag: true }]);
  });

  it('keeps items with activeFlag === true', () => {
    const items: TestItem[] = [{ id: 1, activeFlag: true }];
    const result = filterActiveSkus(items);
    expect(result).toEqual([{ id: 1, activeFlag: true }]);
  });

  it('treats missing activeFlag as active (true)', () => {
    const items: TestItem[] = [{ id: 1 }];
    const result = filterActiveSkus(items);
    expect(result).toEqual([{ id: 1 }]);
  });
});

console.log(`\n========================================`);
console.log(`Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
console.log(`========================================\n`);

if (failedCount > 0) {
  process.exit(1);
}
