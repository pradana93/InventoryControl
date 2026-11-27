// tests/app/analytics.test.ts

import { computeAnalytics, filterAnalyticsItems } from '@/lib/analytics';
import type { CatalogEntry, InventoryLot, LedgerEntry } from '@/lib/db';
import type { AnalyticsItem } from '@/lib/analytics';
import assert from 'assert';

const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.log(`[FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
};

const mockCatalog: CatalogEntry[] = [
  { skuId: 'SKU001', namaBarang: 'Produk A', entitas: 'BBB', kategori: 'Electronics', unitCost: 10000, leadTimeDays: 5, safetyStockDays: 3, activeFlag: true, satuan: 'pcs', status: 'active', barcode: '' },
  { skuId: 'SKU002', namaBarang: 'Produk B', entitas: 'BBB', kategori: 'Electronics', unitCost: 20000, leadTimeDays: 5, safetyStockDays: 3, activeFlag: true, satuan: 'pcs', status: 'active', barcode: '' },
  { skuId: 'SKU003', namaBarang: 'Produk C', entitas: 'BBT', kategori: 'Office', unitCost: 5000, leadTimeDays: 7, safetyStockDays: 2, activeFlag: true, satuan: 'pcs', status: 'active', barcode: '' },
  { skuId: 'SKU004', namaBarang: 'Produk D', entitas: 'BBB', kategori: 'Office', unitCost: 8000, leadTimeDays: 5, safetyStockDays: 3, activeFlag: false, satuan: 'pcs', status: 'inactive', barcode: '' },
  { skuId: 'SKU005', namaBarang: 'Produk E', entitas: 'BBB', kategori: 'Electronics', unitCost: 15000, leadTimeDays: 5, safetyStockDays: 3, activeFlag: true, satuan: 'pcs', status: 'active', barcode: '' },
];

const mockLots: InventoryLot[] = [
  { nomorRak: 'R-A1', namaBarang: 'Produk A', qtySistem: 100, tanggalInbound: '2023-01-01', tanggalExpired: '2024-01-01', expiredLabel: '2024-01-01', daysToExpiry: 365, soh: 100, variance: 0, akurasi: 1, statusFefo: 'FEFO', urutanFefo: 1, stockPicking: 0, barcode: '111', category: 'Electronics', unit: 'pcs', skuId: 'SKU001', jenisLokasi: 'Fixed', entitas: 'BBB' },
  { nomorRak: 'R-A2', namaBarang: 'Produk B', qtySistem: 50, tanggalInbound: '2023-01-01', tanggalExpired: '2024-12-31', expiredLabel: '2024-12-31', daysToExpiry: 730, soh: 50, variance: 0, akurasi: 1, statusFefo: 'FEFO', urutanFefo: 1, stockPicking: 0, barcode: '222', category: 'Electronics', unit: 'pcs', skuId: 'SKU002', jenisLokasi: 'Fixed', entitas: 'BBB' },
  { nomorRak: 'R-B1', namaBarang: 'Produk C', qtySistem: 200, tanggalInbound: '2023-02-01', tanggalExpired: '2024-06-30', expiredLabel: '2024-06-30', daysToExpiry: 215, soh: 200, variance: 0, akurasi: 1, statusFefo: 'FEFO', urutanFefo: 1, stockPicking: 0, barcode: '333', category: 'Office', unit: 'pcs', skuId: 'SKU003', jenisLokasi: 'Fixed', entitas: 'BBT' },
  { nomorRak: 'R-A3', namaBarang: 'Produk E', qtySistem: 75, tanggalInbound: '2023-03-01', tanggalExpired: '2025-03-01', expiredLabel: '2025-03-01', daysToExpiry: 1095, soh: 75, variance: 0, akurasi: 1, statusFefo: 'FEFO', urutanFefo: 1, stockPicking: 0, barcode: '555', category: 'Electronics', unit: 'pcs', skuId: 'SKU005', jenisLokasi: 'Fixed', entitas: 'BBB' },
];

const mockLedger: LedgerEntry[] = [
  { skuName: 'Produk A', entitas: 'BBB', qtyIn: -10, timestamp: '2023-10-26T10:00:00Z', sjNumber: 'S1', remarks: '', recordId: 'L001', rackId: 'R-A1', expiredDate: '2024-01-01' },
  { skuName: 'Produk A', entitas: 'BBB', qtyIn: -12, timestamp: '2023-10-25T10:00:00Z', sjNumber: 'S2', remarks: '', recordId: 'L002', rackId: 'R-A1', expiredDate: '2024-01-01' },
  { skuName: 'Produk B', entitas: 'BBB', qtyIn: -5, timestamp: '2023-10-26T10:00:00Z', sjNumber: 'S5', remarks: '', recordId: 'L005', rackId: 'R-A2', expiredDate: '2024-12-31' },
  { skuName: 'Produk C', entitas: 'BBT', qtyIn: -20, timestamp: '2023-10-26T10:00:00Z', sjNumber: 'S7', remarks: '', recordId: 'L007', rackId: 'R-B1', expiredDate: '2024-06-30' },
];

const now = new Date('2023-10-27T10:00:00Z');

console.log('\n=== Suite: Analytics Functions ===');

test('should correctly compute analytics', () => {
  const activeCatalog = mockCatalog.filter((c) => c.activeFlag);
  const result = computeAnalytics(mockLots, activeCatalog, mockLedger, now);
  assert.strictEqual(result.summary.skuCount, 4); // A, B, C, E active
  const produkA = result.items.find((i) => i.skuName === 'Produk A');
  assert.notStrictEqual(produkA, undefined);
  assert.strictEqual(produkA?.currentStock, 100);
  assert.strictEqual(produkA?.inventoryValue, 1000000);
});

test('filterAnalyticsItems should filter correctly', () => {
  const sampleItems: AnalyticsItem[] = [
    { skuName: 'Laptop Pro', skuId: 'SKU100', entitas: 'BBB', kategori: 'Electronics', currentStock: 10, unitCost: 15000000, inventoryValue: 150000000, forecastDaily: 0.5, forecast30d: 15, daysOfSupply: 20, turnover: 3.5, carryingCost: 3000000, classification: 'A' },
    { skuName: 'Mouse Wireless', skuId: 'SKU101', entitas: 'BBB', kategori: 'Accessories', currentStock: 50, unitCost: 150000, inventoryValue: 7500000, forecastDaily: 2, forecast30d: 60, daysOfSupply: 25, turnover: 5.1, carryingCost: 1500000, classification: 'B' },
  ];
  const filtered = filterAnalyticsItems(sampleItems, { search: 'mouse' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].skuName, 'Mouse Wireless');
});
