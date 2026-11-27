// src/lib/slotting.ts
//
// Slotting optimizer logic. ABC classification + rack slotting recommendations
// based on outbound (picking) velocity. Pure functions so they can be reused by
// the API route, the client component and the test suite.
import type { InventoryLot, LedgerEntry } from './db';

export const MS_PER_DAY = 86400000;

/** Default trailing window (days) used to measure outbound volume. */
export const DEFAULT_ABC_WINDOW_DAYS = 90;

/** A SKU reduced to the fields the slotting engine needs. */
export interface SkuLifecycleItem {
  skuId: string;
  namaBarang: string;
  entitas: 'BBB' | 'BBT';
  activeFlag: boolean;
  currentStock: number;
  inventoryValue: number;
  status: string;
}

export type AbcClassification = 'A' | 'B' | 'C';

export interface AbcClassificationResult {
  skuName: string;
  entitas: 'BBB' | 'BBT';
  classification: AbcClassification;
  volume: number;
}

export interface SlottingRecommendation {
  skuName: string;
  skuId: string;
  entitas: 'BBB' | 'BBT';
  classification: AbcClassification;
  currentStock: number;
  volume: number;
  currentRak: string;
  suggestedRak: string;
  priorityScore: number;
  priorityLabel: string;
  daysSinceLastOutbound: number | 'N/A';
  lastOutbound: string;
}

/** ABC zone mapping: fast movers to prime (lower) slots. */
export const ABC_ZONE: Record<AbcClassification, string> = {
  A: 'RAK-BAWAH',
  B: 'RAK-TENGAH',
  C: 'RAK-ATAS',
};

/** Move-first priority: A items should be relocated before B, then C. */
export const ABC_PRIORITY: Record<AbcClassification, number> = {
  A: 1,
  B: 2,
  C: 3,
};

export const ABC_PRIORITY_LABEL: Record<AbcClassification, string> = {
  A: 'Prioritas 1 (Cepat)',
  B: 'Prioritas 2 (Sedang)',
  C: 'Prioritas 3 (Lambat)',
};

/**
 * ABC classification by outbound volume.
 *
 * Filters ledger for outbound rows (`qtyIn < 0`) within the trailing `days`
 * window, sums `abs(qtyIn)` per SKU, sorts descending by volume, then assigns
 * classes by cumulative share of total volume:
 *   cumulative <= 80% -> 'A', cumulative <= 95% -> 'B', else 'C'.
 */
export function computeAbcClassification(
  ledgerEntries: LedgerEntry[],
  days: number = DEFAULT_ABC_WINDOW_DAYS
): AbcClassificationResult[] {
  const windowStart = new Date(Date.now() - days * MS_PER_DAY);

  const bySku = new Map<
    string,
    { skuName: string; entitas: 'BBB' | 'BBT'; volume: number }
  >();

  for (const entry of ledgerEntries) {
    if (entry.qtyIn >= 0) continue; // outbound only
    if (!entry.timestamp) continue;
    if (new Date(entry.timestamp) < windowStart) continue;

    const key = entry.skuName.toLowerCase();
    const existing = bySku.get(key);
    if (existing) {
      existing.volume += Math.abs(entry.qtyIn);
    } else {
      bySku.set(key, {
        skuName: entry.skuName,
        entitas: entry.entitas,
        volume: Math.abs(entry.qtyIn),
      });
    }
  }

  const rows = Array.from(bySku.values()).sort((a, b) => b.volume - a.volume);
  const total = rows.reduce((sum, r) => sum + r.volume, 0);

  const results: AbcClassificationResult[] = [];
  let cumulative = 0;
  for (const row of rows) {
    cumulative += row.volume;
    const cumulativePct = total > 0 ? (cumulative / total) * 100 : 0;
    let classification: AbcClassification;
    // If only one SKU, it's always 'A' (as it's 100% of the volume).
    if (rows.length === 1 && total > 0) {
      classification = 'A';
    } else if (cumulativePct <= 80) classification = 'A';
    else if (cumulativePct <= 95) classification = 'B';
    else classification = 'C';

    results.push({
      skuName: row.skuName,
      entitas: row.entitas,
      classification,
      volume: row.volume,
    });
  }

  return results;
}

/**
 * Build the slotting move list for the active SKUs.
 *
 * Each active SKU is mapped to its ABC class (SKUs with no outbound history
 * default to 'C'), then to a suggested rack zone. `currentRak` comes from the
 * SKU's first inventory lot; `daysSinceLastOutbound` from the latest ledger row.
 */
export function computeSlottingRecommendations(
  activeSkus: SkuLifecycleItem[],
  classifications: AbcClassificationResult[],
  lots: InventoryLot[],
  ledger: LedgerEntry[] = []
): SlottingRecommendation[] {
  const classBySku = new Map(classifications.map((c) => [c.skuName.toLowerCase(), c]));
  const now = Date.now();

  const recommendations: SlottingRecommendation[] = [];

  for (const sku of activeSkus) {
    const key = sku.namaBarang.toLowerCase();
    const classification = classBySku.get(key);

    const abc: AbcClassification = classification?.classification ?? 'C';
    const volume = classification?.volume ?? 0;

    const skuLots = lots.filter((l) => l.namaBarang.toLowerCase() === key);
    const currentRak = skuLots[0]?.nomorRak || '—';

    // Current stock is the sum of positive lots (fall back to the item's value).
    const lotStock = skuLots
      .filter((l) => l.qtySistem > 0)
      .reduce((sum, l) => sum + l.qtySistem, 0);
    const currentStock = lotStock || sku.currentStock || 0;

    // Latest outbound (any ledger row) for the SKU.
    let lastOutbound = '';
    for (const e of ledger) {
      if (e.skuName.toLowerCase() !== key || !e.timestamp) continue;
      if (!lastOutbound || e.timestamp > lastOutbound) lastOutbound = e.timestamp;
    }

    let daysSinceLastOutbound: number | 'N/A';
    if (!lastOutbound) {
      daysSinceLastOutbound = 'N/A';
    } else {
      const diff = now - new Date(lastOutbound).getTime();
      daysSinceLastOutbound = Math.max(0, Math.floor(diff / MS_PER_DAY));
    }

    recommendations.push({
      skuName: sku.namaBarang,
      skuId: sku.skuId,
      entitas: sku.entitas,
      classification: abc,
      currentStock,
      volume,
      currentRak,
      suggestedRak: ABC_ZONE[abc],
      priorityScore: ABC_PRIORITY[abc],
      priorityLabel: ABC_PRIORITY_LABEL[abc],
      daysSinceLastOutbound,
      lastOutbound: lastOutbound ? lastOutbound.slice(0, 10) : 'Tidak Ada',
    });
  }

  return recommendations.sort((a, b) => {
    return (
      a.priorityScore - b.priorityScore ||
      a.volume - b.volume ||
      a.skuName.localeCompare(b.skuName)
    );
  });
}
