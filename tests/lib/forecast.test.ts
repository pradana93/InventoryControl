// tests/lib/forecast.test.ts
import { calculateForecast } from '@/lib/forecast';

// Minimal test harness
function it(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
    },
    toBeCloseTo(expected: number) {
      if (Math.abs(actual - expected) > 0.01) throw new Error(`Expected ${expected}, got ${actual}`);
    }
  };
}

console.log('=== Suite: forecast.ts ===');

it('calculates WMA-5m with 5 months of data', () => {
  // history: [100, 120, 140, 160, 180] (oldest to newest)
  // WMA calculation:
  // recent: [180, 160, 140, 120, 100]
  // weights: [5, 4, 3, 2, 1]
  // weightedSum = (180*5 + 160*4 + 140*3 + 120*2 + 100*1) = 900 + 640 + 420 + 240 + 100 = 2300
  // sumOfWeights = 15
  // weightedAvg = 2300 / 15 = 153.333
  const res = calculateForecast([100, 120, 140, 160, 180]);
  expect(res.forecastStatus).toBe('OK');
  expect(res.forecastMethod).toBe('WMA-5m');
  expect(res.forecast30d).toBeCloseTo(153.33);
});

it('uses only last 5 months for 6+ months of data', () => {
  // input: [50, 100, 120, 140, 160, 180]
  // uses only: [100, 120, 140, 160, 180]
  // same as first test
  const res = calculateForecast([50, 100, 120, 140, 160, 180]);
  expect(res.forecast30d).toBeCloseTo(153.33);
});

it('falls back to SIMPLE-AVG with < 3 months data', () => {
  // history: [100, 120]
  // avg = (100+120)/2 = 110
  const res = calculateForecast([100, 120]);
  expect(res.forecastStatus).toBe('LOW_DATA');
  expect(res.forecastMethod).toBe('SIMPLE-AVG');
  expect(res.forecast30d).toBeCloseTo(110);
});

it('handles zero/empty history', () => {
  const res = calculateForecast([0, 0, 0]);
  expect(res.forecastStatus).toBe('LOW_DATA');
  expect(res.forecast30d).toBe(0);
});
