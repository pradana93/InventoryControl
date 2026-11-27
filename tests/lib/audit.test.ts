import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Import lazily inside tests so env vars from .env.local are loaded first.
type AuditModule = typeof import('@/lib/audit');
let audit: AuditModule;

// Minimal self-contained test harness for the TypeScript runner.
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
    toBeTruthy() {
      if (!actual) throw new Error(`Expected a truthy value, received ${actual}`);
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, received ${JSON.stringify(actual)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
  };
}

const TEST_EMAIL = 'audit-test@example.com';
const TEST_TABLE = 'catalog';
const TEST_RECORD_ID = 'AUD-001';

describe('audit log helper', () => {
  test('audit log records action and retrieves correctly', async () => {
    audit = audit || (await import('@/lib/audit'));
    const { logAuditAction, getAuditLogs } = audit;
    const id = await logAuditAction({
      userId: TEST_EMAIL,
      action: 'UPDATE',
      entity: TEST_TABLE,
      recordId: TEST_RECORD_ID,
      oldValues: { unit_cost: 1000 },
      newValues: { unit_cost: 2000 },
    });
    expect(id).toBeTruthy();

    const logs = await getAuditLogs({ action: 'UPDATE', tableName: TEST_TABLE });
    expect(logs.length).toBeGreaterThan(0);

    const match = logs.find((l) => l.id === id);
    expect(match).toBeDefined();
    expect(match!.userEmail).toBe(TEST_EMAIL);
    expect(match!.action).toBe('UPDATE');
    expect(match!.tableName).toBe(TEST_TABLE);
    expect(match!.recordId).toBe(TEST_RECORD_ID);
    expect(match!.oldValues?.unit_cost).toBe(1000);
    expect(match!.newValues?.unit_cost).toBe(2000);
  });

  test('null oldValues/newValues are stored and returned as null', async () => {
    audit = audit || (await import('@/lib/audit'));
    const { logAuditAction, getAuditLogs } = audit;
    const id = await logAuditAction({
      userId: TEST_EMAIL,
      action: 'INSERT',
      entity: TEST_TABLE,
      recordId: TEST_RECORD_ID,
      newValues: { nama_barang: 'Test SKU' },
    });
    expect(id).toBeTruthy();

    const logs = await getAuditLogs({ action: 'INSERT', entity: TEST_TABLE });
    const match = logs.find((l) => l.id === id);
    expect(match).toBeDefined();
    expect(match!.oldValues).toBeNull();
    expect(match!.newValues?.nama_barang).toBe('Test SKU');
  });

  test('invalid action string is rejected', async () => {
    audit = audit || (await import('@/lib/audit'));
    const { logAuditAction, isValidAuditAction } = audit;
    let threw = false;
    try {
      await logAuditAction({
        userId: TEST_EMAIL,
        action: 'BOGUS',
        entity: TEST_TABLE,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(isValidAuditAction('TOGGLE')).toBe(true);
    expect(isValidAuditAction('BOGUS')).toBe(false);
  });

  test('missing userId is rejected', async () => {
    audit = audit || (await import('@/lib/audit'));
    const { logAuditAction } = audit;
    let threw = false;
    try {
      await logAuditAction({
        userId: '',
        action: 'DELETE',
        entity: TEST_TABLE,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
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
}, 4000);
