// src/lib/analytics.ts
// Advanced analytics: DOS/DOI, inventory turnover, carrying cost, and
// exponential-smoothing demand forecast. Pure functions — no IO — so they are
// unit-testable and shared between the API route and (if needed) the client.

import type { CatalogEntry, InventoryLot, LedgerEntry } from './db';
import { calculateExponentialSmoothingForecast, calculateDaysOfSupply } from './forecasting';

export type AbcClass = 'A' | 'B' | 'C';

/** Annual carrying-cost rate applied to inventory value (storage, capital, risk). */
export const CARRYING_COST_RATE = 0.2;

const MS_PER_DAY = 86400000;

export interface AnalyticsItem {
  skuName: string;
  skuId: string;
  entitas: string;
  kategori: string;
  currentStock: number;
  unitCost: number;
  inventoryValue: number;
  /** Exponential-smoothing daily demand forecast. */
  forecastDaily: number;
  forecast30d: number;
  /** Days of Supply (a.k.a. Days of Inventory). 999 = effectively infinite. */
  daysOfSupply: number;
  /** Annualized inventory turnover (COGS / average inventory value). */
  turnover: number;
  /** Annual carrying cost in Rupiah. */
  carryingCost: number;
  classification: AbcClass;
}

export interface AnalyticsSummary {
  totalInventoryValue: number;
  totalCarryingCost: number;
  avgTurnover: number;
  avgDOS: number;
  skuCount: number;
  classA: number;
  classB: number;
  classC: number;
}

export interface AnalyticsResult {
  items: AnalyticsItem[];
  summary: AnalyticsSummary;
}

/**
 * Total on-hand system quantity for a SKU across all of its lots.
 */
function currentStockFor(lots: InventoryLot[], skuName: string): number {
  const key = skuName.toLowerCase();
  return lots
    .filter((l) => l.namaBarang.toLowerCase() === key && l.qtySistem > 0)
    .reduce((sum, l) => sum + l.qtySistem, 0);
}

/**
 * Outbound quantity (as a positive number) for one SKU inside the trailing
 * `days` window.
 */
function outboundQtyInWindow(
  ledger: LedgerEntry[],
  skuName: string,
  days: number,
  now: Date
): number {
  const key = skuName.toLowerCase();
  const cutoff = now.getTime() - days * MS_PER_DAY;
  let total = 0;
  for (const e of ledger) {
    if (e.skuName.toLowerCase() !== key || e.qtyIn >= 0 || !e.timestamp) continue;
    const ts = new Date(e.timestamp).getTime();
    if (ts >= cutoff && ts <= now.getTime()) total += Math.abs(e.qtyIn);
  }
  return total;
}

/**
 * ABC classification by cumulative outbound volume (Pareto). A = top 80% of
 * volume, B = next 15%, C = remaining 5%. SKUs with no volume land in C.
 */
export function classifyAbc(
  entries: Array<{ skuName: string; volume: number }>
): Map<string, AbcClass> {
  const result = new Map<string, AbcClass>();
  const totalVolume = entries.reduce((s, e) => s + e.volume, 0);
  if (totalVolume <= 0) {
    for (const e of entries) result.set(e.skuName.toLowerCase(), 'C');
    return result;
  }

  const sorted = [...entries].sort((a, b) => b.volume - a.volume);
  let cumulative = 0;
  for (const entry of sorted) {
    // Cumulative share once this SKU is included.
    cumulative += entry.volume;
    const pct = (cumulative / totalVolume) * 100;
    let cls: AbcClass;
    if (pct <= 80) cls = 'A';
    else if (pct <= 95) cls = 'B';
    else cls = 'C';
    result.set(entry.skuName.toLowerCase(), cls);
  }
  return result;
}

/**
 * Case-insensitive partial match on SKU name and category. An empty filter
 * matches everything.
 */
export function filterAnalyticsItems(
  items: AnalyticsItem[],
  filters: { search?: string; classification?: AbcClass | 'ALL' }
): AnalyticsItem[] {
  const search = filters.search?.trim().toLowerCase();
  const cls = filters.classification || 'ALL';
  return items.filter((item) => {
    if (cls !== 'ALL' && item.classification !== cls) return false;
    if (search) {
      const hay = `${item.skuName} ${item.kategori}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

/**
 * Compute the full analytics dataset for a set of active SKUs.
 *
 * turnover      = (outbound value over 90 days * 4) / inventory value
 *                 (annualized; 90 days * 4 ≈ 1 year)
 * carryingCost  = inventory value * CARRYING_COST_RATE
 */
export function computeAnalytics(
  lots: InventoryLot[],
  catalog: CatalogEntry[],
  ledger: LedgerEntry[],
  now: Date = new Date()
): AnalyticsResult {
  const volumes = catalog.map((c) => ({
    skuName: c.namaBarang,
    volume: outboundQtyInWindow(ledger, c.namaBarang, 90, now),
  }));
  const abc = classifyAbc(volumes);

  const items: AnalyticsItem[] = catalog.map((entry) => {
    const currentStock = currentStockFor(lots, entry.namaBarang);
    const unitCost = entry.unitCost || 0;
    const inventoryValue = currentStock * unitCost;

    // Per-SKU ledger slice for the smoothing forecast.
    const key = entry.namaBarang.toLowerCase();
    const skuLedger = ledger.filter((e) => e.skuName.toLowerCase() === key);
    const { forecastDaily, forecast30d } = calculateExponentialSmoothingForecast(skuLedger);

    const daysOfSupply = calculateDaysOfSupply(currentStock, forecastDaily);

    const outbound90 = volumes.find(
      (v) => v.skuName.toLowerCase() === key
    )?.volume ?? 0;
    const annualizedCogs = outbound90 * unitCost * 4;
    const turnover = inventoryValue > 0 ? annualizedCogs / inventoryValue : 0;

    return {
      skuName: entry.namaBarang,
      skuId: entry.skuId,
      entitas: entry.entitas,
      kategori: entry.kategori || 'General',
      currentStock,
      unitCost,
      inventoryValue,
      forecastDaily,
      forecast30d,
      daysOfSupply,
      turnover: Math.round(turnover * 100) / 100,
      carryingCost: inventoryValue * CARRYING_COST_RATE,
      classification: abc.get(key) || 'C',
    };
  });

  const totalInventoryValue = items.reduce((s, i) => s + i.inventoryValue, 0);
  const totalCarryingCost = items.reduce((s, i) => s + i.carryingCost, 0);

  // Average turnover over SKUs that actually carry stock (turnover of a
  // zero-stock SKU is undefined and would skew the mean toward 0).
  const stocked = items.filter((i) => i.inventoryValue > 0);
  const avgTurnover =
    stocked.length > 0
      ? stocked.reduce((s, i) => s + i.turnover, 0) / stocked.length
      : 0;

  // Average DOS over SKUs with finite supply (999 = infinite, excluded).
  const finiteDos = items.filter((i) => i.daysOfSupply < 999);
  const avgDOS =
    finiteDos.length > 0
      ? finiteDos.reduce((s, i) => s + i.daysOfSupply, 0) / finiteDos.length
      : 0;

  const summary: AnalyticsSummary = {
    totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
    totalCarryingCost: Math.round(totalCarryingCost * 100) / 100,
    avgTurnover: Math.round(avgTurnover * 100) / 100,
    avgDOS: Math.round(avgDOS * 10) / 10,
    skuCount: items.length,
    classA: items.filter((i) => i.classification === 'A').length,
    classB: items.filter((i) => i.classification === 'B').length,
    classC: items.filter((i) => i.classification === 'C').length,
  };

  // Present highest-value SKUs first.
  items.sort(
    (a, b) => b.inventoryValue - a.inventoryValue || a.skuName.localeCompare(b.skuName)
  );

  return { items, summary };
}
