
// src/lib/inventory-calculator.ts
import { CatalogEntry, LedgerEntry, InventoryLot } from './db';
import { calculateForecast } from './forecast';

export interface CalculatorResult {
  skuName: string;
  entitas: 'BBB' | 'BBT';
  currentStock: number; // sum of qty > 0 lots
  unitCost: number;
  avgDailyUsage: number; // from last 30 days outbound ledger
  doi: number; // currentStock / avgDailyUsage (Infinity if no usage)
  leadTimeDays: number;
  safetyStockDays: number;
  coverageDays: number; // doi - leadTimeDays
  status: 'KRITIS' | 'AMAN' | 'OVERSTOCK';
  safetyStockQty: number; // avgDailyUsage * safetyStockDays
  ropQty: number; // avgDailyUsage * leadTimeDays + safetyStockQty
  saranOrderQty: number; // max(0, ropQty - currentStock)
  inventoryValue: number; // currentStock * unitCost
  forecast30d: number; // weighted forecast next 30 days
  forecastPerDay: number;
  forecastStatus: 'OK' | 'LOW_DATA';
  forecastMethod: string; // e.g. 'WMA-5m'
}

export interface CalculatorInput {
  lots: InventoryLot[];
  catalog: CatalogEntry[];
  ledger: LedgerEntry[];
  entity: 'BBB' | 'BBT' | 'ALL';
}

export function calculateInventoryMetrics(input: CalculatorInput): CalculatorResult[] {
  const { lots, catalog, ledger, entity } = input;
  const results: CalculatorResult[] = [];

  const filteredCatalog = catalog.filter(
    (item) => entity === 'ALL' || item.entitas === entity
  );

  for (const catalogEntry of filteredCatalog) {
    const skuName = catalogEntry.namaBarang;
    const entitas = catalogEntry.entitas as 'BBB' | 'BBT';

    // 2a. currentStock
    const currentStock = lots
      .filter(
        (lot) =>
          lot.namaBarang.toLowerCase() === skuName.toLowerCase() && lot.qtySistem > 0
      )
      .reduce((sum, lot) => sum + lot.qtySistem, 0);

    // 2b. unitCost
    const unitCost = catalogEntry.unitCost || 0;

    // 2c. avgDailyUsage (from last 30 days outbound ledger)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const outboundLedgerEntries = ledger.filter(
      (entry) =>
        entry.skuName.toLowerCase() === skuName.toLowerCase() &&
        entry.qtyIn < 0 &&
        new Date(entry.timestamp) >= thirtyDaysAgo
    );

    const totalOutboundQty = outboundLedgerEntries.reduce(
      (sum, entry) => sum + Math.abs(entry.qtyIn),
      0
    );
    const avgDailyUsage = outboundLedgerEntries.length > 0 ? totalOutboundQty / 30 : 0;

    // 2d. doi
    const doi = avgDailyUsage > 0 ? currentStock / avgDailyUsage : Infinity;

    // From catalog
    const leadTimeDays = catalogEntry.leadTimeDays;
    const safetyStockDays = catalogEntry.safetyStockDays;

    // 2e. coverageDays
    const coverageDays = doi - leadTimeDays;

    // 2f. status
    let status: 'KRITIS' | 'AMAN' | 'OVERSTOCK';
    if (coverageDays < 0) {
      status = 'KRITIS';
    } else if (coverageDays > leadTimeDays * 3) {
      status = 'OVERSTOCK';
    } else {
      status = 'AMAN';
    }

    // 2g. safetyStockQty
    const safetyStockQty = avgDailyUsage * safetyStockDays;

    // 2h. ropQty
    const ropQty = avgDailyUsage * leadTimeDays + safetyStockQty;

    // 2i. saranOrderQty
    const saranOrderQty = Math.max(0, ropQty - currentStock);

    // 2j. inventoryValue
    const inventoryValue = currentStock * unitCost;

    // 2k. Forecast: Weighted Moving Average of last 5 months outbound history.
    // Build monthlyHistory (oldest -> newest) by grouping outbound ledger
    // transactions per month over the last 12 months.
    const monthlyHistory: number[] = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0, 23, 59, 59, 999);

      const monthlyOutboundQty = ledger
        .filter(
          (entry) =>
            entry.skuName.toLowerCase() === skuName.toLowerCase() &&
            entry.qtyIn < 0 &&
            new Date(entry.timestamp) >= monthStart &&
            new Date(entry.timestamp) <= monthEnd
        )
        .reduce((sum, entry) => sum + Math.abs(entry.qtyIn), 0);
      monthlyHistory.push(monthlyOutboundQty);
    }

    const forecast = calculateForecast(monthlyHistory);
    const { forecast30d, forecastPerDay, forecastStatus, forecastMethod } = forecast;

    results.push({
      skuName,
      entitas,
      currentStock,
      unitCost,
      avgDailyUsage,
      doi,
      leadTimeDays,
      safetyStockDays,
      coverageDays,
      status,
      safetyStockQty,
      ropQty,
      saranOrderQty,
      inventoryValue,
      forecast30d,
      forecastPerDay,
      forecastStatus,
      forecastMethod,
    });
  }

  return results;
}
