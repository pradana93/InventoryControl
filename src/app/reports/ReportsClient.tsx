'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  AlertCircle,
  Download,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  PackageX,
  Activity,
  FileSpreadsheet,
} from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';
import type { CatalogEntry, InventoryLot, LedgerEntry } from '@/lib/db';
import { filterActiveSkus } from '@/lib/warehouse-optimization';

// ============================================================================
// TYPES
// ============================================================================

export interface ValuationGroup {
  kategori: string;
  entitas: string;
  skuCount: number;
  totalQty: number;
  totalValue: number;
  skus: ValuationSku[];
}

export interface ValuationSku {
  skuName: string;
  entitas: string;
  currentStock: number;
  unitCost: number;
  inventoryValue: number;
}

export interface SlowMovingItem {
  skuName: string;
  entitas: string;
  currentStock: number;
  unitCost: number;
  inventoryValue: number;
  lastMovement: string;
  daysSinceMovement: number | 'N/A';
  deadStock: boolean;
}

export interface VelocityItem {
  skuName: string;
  entitas: string;
  avgDailyUsage: number;
  currentStock: number;
  daysOfCover: number;
  trend: 'UP' | 'DOWN' | 'FLAT';
}

export interface ReportData {
  valuation: ValuationGroup[];
  slowMoving: SlowMovingItem[];
  velocity: VelocityItem[];
}

const MS_PER_DAY = 86400000;

// ============================================================================
// PURE COMPUTATION FUNCTIONS (exported for testing)
// ============================================================================

function currentStockFor(lots: InventoryLot[], skuName: string): number {
  const key = skuName.toLowerCase();
  return lots
    .filter((l) => l.namaBarang.toLowerCase() === key && l.qtySistem > 0)
    .reduce((sum, l) => sum + l.qtySistem, 0);
}

function avgDailyUsageFor(ledger: LedgerEntry[], skuName: string, now: Date): number {
  const key = skuName.toLowerCase();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
  const outbound = ledger.filter(
    (e) =>
      e.skuName.toLowerCase() === key &&
      e.qtyIn < 0 &&
      !!e.timestamp &&
      new Date(e.timestamp) >= thirtyDaysAgo
  );
  if (outbound.length === 0) return 0;
  const total = outbound.reduce((sum, e) => sum + Math.abs(e.qtyIn), 0);
  return total / 30;
}

/**
 * Group catalog SKUs by kategori + entitas and value them from the lots.
 * Groups with zero stock are still included.
 */
export function computeValuation(
  lots: InventoryLot[],
  catalog: CatalogEntry[]
): ValuationGroup[] {
  const groups = new Map<string, ValuationGroup>();

  for (const entry of catalog) {
    const kategori = entry.kategori || 'General';
    const entitas = entry.entitas;
    const key = `${kategori}||${entitas}`;

    if (!groups.has(key)) {
      groups.set(key, {
        kategori,
        entitas,
        skuCount: 0,
        totalQty: 0,
        totalValue: 0,
        skus: [],
      });
    }

    const group = groups.get(key)!;
    const currentStock = currentStockFor(lots, entry.namaBarang);
    const inventoryValue = currentStock * (entry.unitCost || 0);

    group.skuCount += 1;
    group.totalQty += currentStock;
    group.totalValue += inventoryValue;
    group.skus.push({
      skuName: entry.namaBarang,
      entitas,
      currentStock,
      unitCost: entry.unitCost || 0,
      inventoryValue,
    });
  }

  for (const group of groups.values()) {
    group.skus.sort((a, b) => b.inventoryValue - a.inventoryValue);
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.totalValue - a.totalValue || a.kategori.localeCompare(b.kategori)
  );
}

const NO_MOVEMENT = { lastMovement: 'Tidak Ada', daysSinceMovement: 'N/A' as const };

function latestMovement(
  ledger: LedgerEntry[],
  skuName: string,
  now: Date
): { lastMovement: string; daysSinceMovement: number | 'N/A' } {
  const key = skuName.toLowerCase();
  const entries = ledger
    .filter((e) => e.skuName.toLowerCase() === key && !!e.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (entries.length === 0) return NO_MOVEMENT;

  const latest = entries[0].timestamp;
  const diff = now.getTime() - new Date(latest).getTime();
  return {
    lastMovement: String(latest).slice(0, 10),
    daysSinceMovement: Math.max(0, Math.floor(diff / MS_PER_DAY)),
  };
}

/**
 * Items with no outbound usage in the last 30 days but positive stock.
 * Flagged as dead stock once there has been no movement for more than 60 days.
 */
export function computeSlowMoving(
  lots: InventoryLot[],
  catalog: CatalogEntry[],
  ledger: LedgerEntry[],
  now: Date = new Date()
): SlowMovingItem[] {
  const items: SlowMovingItem[] = [];

  for (const entry of catalog) {
    const currentStock = currentStockFor(lots, entry.namaBarang);
    if (currentStock <= 0) continue;

    const avgDailyUsage = avgDailyUsageFor(ledger, entry.namaBarang, now);
    if (avgDailyUsage !== 0) continue;

    const movement = latestMovement(ledger, entry.namaBarang, now);

    items.push({
      skuName: entry.namaBarang,
      entitas: entry.entitas,
      currentStock,
      unitCost: entry.unitCost || 0,
      inventoryValue: currentStock * (entry.unitCost || 0),
      lastMovement: movement.lastMovement,
      daysSinceMovement: movement.daysSinceMovement,
      deadStock:
        movement.daysSinceMovement !== 'N/A' && movement.daysSinceMovement > 60,
    });
  }

  return items.sort((a, b) => {
    const av = a.daysSinceMovement === 'N/A' ? Infinity : a.daysSinceMovement;
    const bv = b.daysSinceMovement === 'N/A' ? Infinity : b.daysSinceMovement;
    return bv - av || b.inventoryValue - a.inventoryValue;
  });
}

function computeTrend(
  ledger: LedgerEntry[],
  skuName: string,
  now: Date
): 'UP' | 'DOWN' | 'FLAT' {
  const key = skuName.toLowerCase();
  const nowMs = now.getTime();

  let last7 = 0;
  let prior7 = 0;

  for (const e of ledger) {
    if (e.skuName.toLowerCase() !== key || e.qtyIn >= 0 || !e.timestamp) continue;
    const ts = new Date(e.timestamp).getTime();
    if (ts > nowMs) continue;
    const age = nowMs - ts;
    const qty = Math.abs(e.qtyIn);
    if (age <= 7 * MS_PER_DAY) {
      last7 += qty;
    } else if (age <= 14 * MS_PER_DAY) {
      prior7 += qty;
    }
  }

  if (last7 > prior7) return 'UP';
  if (last7 < prior7) return 'DOWN';
  return 'FLAT';
}

/**
 * SKUs with outbound usage, with days-of-cover and a 7-day trend.
 */
export function computeVelocity(
  lots: InventoryLot[],
  catalog: CatalogEntry[],
  ledger: LedgerEntry[],
  now: Date = new Date()
): VelocityItem[] {
  const items: VelocityItem[] = [];

  for (const entry of catalog) {
    const avgDailyUsage = avgDailyUsageFor(ledger, entry.namaBarang, now);
    if (avgDailyUsage <= 0) continue;

    const currentStock = currentStockFor(lots, entry.namaBarang);

    items.push({
      skuName: entry.namaBarang,
      entitas: entry.entitas,
      avgDailyUsage,
      currentStock,
      daysOfCover: currentStock / avgDailyUsage,
      trend: computeTrend(ledger, entry.namaBarang, now),
    });
  }

  return items.sort(
    (a, b) => a.daysOfCover - b.daysOfCover || a.skuName.localeCompare(b.skuName)
  );
}

// ============================================================================
// FORMAT HELPERS
// ============================================================================

const formatNumber = (num: number, decimals = 0) =>
  Number(num || 0).toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const formatCurrency = (num: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num || 0);

const TREND_BADGE: Record<VelocityItem['trend'], string> = {
  UP: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  DOWN: 'bg-red-500/20 text-red-300 border-red-500/40',
  FLAT: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ReportsPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { entity, badge } = useEntity();

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const entityLabel = entity === 'ALL' ? 'Semua Entitas' : entity;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportRes, catalogRes] = await Promise.all([
        fetch(`/api/inventory/report?ent=${entity}`),
        fetch(`/api/sku?action=list`),
      ]);
      if (!reportRes.ok) throw new Error('Gagal memuat laporan inventori');
      const json: ReportData = await reportRes.json();

      // Build the set of active SKU names (missing activeFlag = active) so
      // inactive/archived SKUs never surface in the reports, even if the
      // report API has not been filtered yet.
      const catalogEntries: CatalogEntry[] = catalogRes.ok ? await catalogRes.json() : [];
      const activeNames = new Set(
        filterActiveSkus(catalogEntries).map((c) => c.namaBarang.toLowerCase())
      );
      const isActiveName = (skuName: string) =>
        activeNames.size === 0 || activeNames.has(skuName.toLowerCase());

      setData({
        valuation: (json.valuation || [])
          .map((group) => {
            const skus = group.skus.filter((s) => isActiveName(s.skuName));
            return {
              ...group,
              skus,
              skuCount: skus.length,
              totalQty: skus.reduce((sum, s) => sum + s.currentStock, 0),
              totalValue: skus.reduce((sum, s) => sum + s.inventoryValue, 0),
            };
          })
          .filter((group) => group.skus.length > 0),
        slowMoving: (json.slowMoving || []).filter((item) => isActiveName(item.skuName)),
        velocity: (json.velocity || []).filter((item) => isActiveName(item.skuName)),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role as string | undefined;
      if (role !== 'super-admin' && role !== 'manager') {
        router.push(role === 'operator' ? '/' : '/login');
        return;
      }
      fetchData();
    } else if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [session, status, router, fetchData]);

  const valuation = data?.valuation ?? [];
  const slowMoving = data?.slowMoving ?? [];
  const velocity = data?.velocity ?? [];

  const totals = useMemo(() => {
    return valuation.reduce(
      (acc, g) => ({
        skuCount: acc.skuCount + g.skuCount,
        totalQty: acc.totalQty + g.totalQty,
        totalValue: acc.totalValue + g.totalValue,
      }),
      { skuCount: 0, totalQty: 0, totalValue: 0 }
    );
  }, [valuation]);

  const deadStockCount = slowMoving.filter((i) => i.deadStock).length;

  const toggleGroup = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // --------------------------------------------------------------------------
  // Excel export helpers
  // --------------------------------------------------------------------------
  const valuationRows = () => {
    const rows: (string | number)[][] = [];
    for (const g of valuation) {
      rows.push([
        g.kategori,
        g.entitas,
        g.skuCount,
        g.totalQty,
        Math.round(g.totalValue),
        '(subtotal kategori)',
      ]);
      for (const s of g.skus) {
        rows.push([
          g.kategori,
          s.entitas,
          s.skuName,
          s.currentStock,
          Math.round(s.inventoryValue),
          Math.round(s.unitCost),
        ]);
      }
    }
    return rows;
  };

  const buildValuationSheet = (XLSX: any) => {
    const header = ['Kategori', 'Entitas', 'SKU', 'Total Qty', 'Total Nilai (Rp)', 'Harga Satuan'];
    const aoa: (string | number)[][] = [
      ['LAPORAN VALUASI STOK'],
      ['Entitas:', entityLabel, '', 'Diekspor:', new Date().toLocaleString('id-ID')],
      [],
      header,
      ...valuationRows(),
      [],
      ['TOTAL', '', totals.skuCount, totals.totalQty, Math.round(totals.totalValue), ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    return ws;
  };

  const buildSlowMovingSheet = (XLSX: any) => {
    const header = ['SKU', 'Entitas', 'Stok', 'Harga', 'Nilai', 'Last Movement', 'Days Since', 'Status'];
    const aoa: (string | number)[][] = [
      ['LAPORAN SLOW MOVING / DEAD STOCK'],
      ['Entitas:', entityLabel, '', 'Diekspor:', new Date().toLocaleString('id-ID')],
      [],
      header,
      ...slowMoving.map((i) => [
        i.skuName,
        i.entitas,
        i.currentStock,
        Math.round(i.unitCost),
        Math.round(i.inventoryValue),
        i.lastMovement,
        i.daysSinceMovement,
        i.deadStock ? 'Dead' : 'Normal',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    return ws;
  };

  const buildVelocitySheet = (XLSX: any) => {
    const header = ['SKU', 'Entitas', 'Avg Daily Usage', 'Stok', 'Days of Cover', 'Trend'];
    const aoa: (string | number)[][] = [
      ['LAPORAN DISTRIBUSI & VELOCITY'],
      ['Entitas:', entityLabel, '', 'Diekspor:', new Date().toLocaleString('id-ID')],
      [],
      header,
      ...velocity.map((i) => [
        i.skuName,
        i.entitas,
        Number(i.avgDailyUsage.toFixed(2)),
        i.currentStock,
        Number(i.daysOfCover.toFixed(1)),
        i.trend,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    return ws;
  };

  const handleExportTab = async (tab: 'valuation' | 'slowMoving' | 'velocity') => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const date = new Date().toISOString().slice(0, 10);
      const wb = XLSX.utils.book_new();
      if (tab === 'valuation') {
        XLSX.utils.book_append_sheet(wb, buildValuationSheet(XLSX), 'Valuasi Stok');
      } else if (tab === 'slowMoving') {
        XLSX.utils.book_append_sheet(wb, buildSlowMovingSheet(XLSX), 'Slow Moving');
      } else {
        XLSX.utils.book_append_sheet(wb, buildVelocitySheet(XLSX), 'Velocity');
      }
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const names = {
        valuation: 'Valuasi-Stok',
        slowMoving: 'Slow-Moving',
        velocity: 'Velocity',
      };
      a.download = `Laporan-${names[tab]}-${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Gagal mengekspor file Excel');
    } finally {
      setExporting(false);
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const date = new Date().toISOString().slice(0, 10);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, buildValuationSheet(XLSX), 'Valuasi Stok');
      XLSX.utils.book_append_sheet(wb, buildSlowMovingSheet(XLSX), 'Slow Moving');
      XLSX.utils.book_append_sheet(wb, buildVelocitySheet(XLSX), 'Velocity');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan-Persediaan-${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Gagal mengekspor file Excel');
    } finally {
      setExporting(false);
    }
  };

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" />
            Laporan Persediaan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Valuasi stok, slow moving / dead stock, dan distribusi velocity untuk entitas{' '}
            {entityLabel}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.badge}`}
          >
            {entityLabel}
          </span>
          <Button
            variant="outline"
            onClick={handleExportAll}
            disabled={exporting || !data}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Export All Excel
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Nilai Persediaan</p>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Jumlah SKU</p>
            <p className="text-2xl font-bold">{formatNumber(totals.skuCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Slow Moving</p>
            <p className="text-2xl font-bold text-amber-400">{slowMoving.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Dead Stock</p>
            <p className="text-2xl font-bold text-red-400">{deadStockCount}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="valuation" className="space-y-4">
        <TabsList>
          <TabsTrigger value="valuation">Valuasi Stok</TabsTrigger>
          <TabsTrigger value="slowMoving">Slow Moving / Dead Stock</TabsTrigger>
          <TabsTrigger value="velocity">Distribusi &amp; Velocity</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {/* Tab 1: Valuation                                                  */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="valuation">
          <Card className="bg-background border-border">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">Valuasi Stok per Kategori</CardTitle>
                <CardDescription>
                  {valuation.length} kategori · {totals.skuCount} SKU · nilai{' '}
                  {formatCurrency(totals.totalValue)}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportTab('valuation')}
                disabled={exporting || valuation.length === 0}
              >
                <Download className="h-4 w-4 mr-2" /> Export Excel
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              {valuation.length === 0 ? (
                <EmptyState icon={<BarChart2 className="h-12 w-12" />} text="Tidak ada data valuasi" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Kategori</TableHead>
                        <TableHead className="w-24 text-center">Entitas</TableHead>
                        <TableHead className="w-24 text-right">Jml SKU</TableHead>
                        <TableHead className="w-28 text-right">Total Qty</TableHead>
                        <TableHead className="w-40 text-right">Total Nilai</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {valuation.map((g) => {
                        const key = `${g.kategori}||${g.entitas}`;
                        const isOpen = !!expanded[key];
                        return (
                          <>
                            <TableRow
                              key={key}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => toggleGroup(key)}
                            >
                              <TableCell className="text-muted-foreground">
                                {isOpen ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </TableCell>
                              <TableCell className="font-medium">{g.kategori}</TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="outline"
                                  className={
                                    g.entitas === 'BBB'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-sky-100 text-sky-800'
                                  }
                                >
                                  {g.entitas}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatNumber(g.skuCount)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatNumber(g.totalQty)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold">
                                {formatCurrency(g.totalValue)}
                              </TableCell>
                            </TableRow>
                            {isOpen &&
                              g.skus.map((s) => (
                                <TableRow
                                  key={`${key}-${s.skuName}`}
                                  className="bg-muted/20"
                                >
                                  <TableCell />
                                  <TableCell className="pl-8 text-sm text-muted-foreground">
                                    {s.skuName}
                                  </TableCell>
                                  <TableCell className="text-center text-xs text-muted-foreground">
                                    {s.entitas}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {formatNumber(s.currentStock)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                    {formatCurrency(s.unitCost)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {formatCurrency(s.inventoryValue)}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </>
                        );
                      })}
                      <TableRow className="border-t-2 font-bold">
                        <TableCell />
                        <TableCell>TOTAL</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-mono">
                          {formatNumber(totals.skuCount)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(totals.totalQty)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-primary">
                          {formatCurrency(totals.totalValue)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Tab 2: Slow Moving / Dead Stock                                   */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="slowMoving">
          <Card className="bg-background border-border">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">Slow Moving / Dead Stock</CardTitle>
                <CardDescription>
                  {slowMoving.length} item tanpa pemakaian 30 hari · {deadStockCount} dead stock
                  (&gt; 60 hari tanpa pergerakan)
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportTab('slowMoving')}
                disabled={exporting || slowMoving.length === 0}
              >
                <Download className="h-4 w-4 mr-2" /> Export Excel
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              {slowMoving.length === 0 ? (
                <EmptyState
                  icon={<PackageX className="h-12 w-12" />}
                  text="Tidak ada item slow moving"
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">No</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="w-24 text-center">Entitas</TableHead>
                        <TableHead className="w-24 text-right">Stok</TableHead>
                        <TableHead className="w-28 text-right">Harga</TableHead>
                        <TableHead className="w-32 text-right">Nilai</TableHead>
                        <TableHead className="w-32 text-center">Last Movement</TableHead>
                        <TableHead className="w-28 text-right">Days Since</TableHead>
                        <TableHead className="w-24 text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {slowMoving.map((item, index) => (
                        <TableRow key={`${item.entitas}-${item.skuName}`}>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium max-w-xs truncate" title={item.skuName}>
                            {item.skuName}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={
                                item.entitas === 'BBB'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-sky-100 text-sky-800'
                              }
                            >
                              {item.entitas}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatNumber(item.currentStock)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(item.unitCost)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            {formatCurrency(item.inventoryValue)}
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {item.lastMovement}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {item.daysSinceMovement === 'N/A'
                              ? 'N/A'
                              : formatNumber(item.daysSinceMovement)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={
                                item.deadStock
                                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }
                            >
                              {item.deadStock ? 'Dead' : 'Normal'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Tab 3: Velocity                                                   */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="velocity">
          <Card className="bg-background border-border">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">Distribusi &amp; Velocity</CardTitle>
                <CardDescription>
                  {velocity.length} SKU dengan pemakaian aktif · diurutkan dari days of cover
                  terendah
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportTab('velocity')}
                disabled={exporting || velocity.length === 0}
              >
                <Download className="h-4 w-4 mr-2" /> Export Excel
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              {velocity.length === 0 ? (
                <EmptyState
                  icon={<Activity className="h-12 w-12" />}
                  text="Tidak ada SKU dengan pemakaian aktif"
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">No</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="w-24 text-center">Entitas</TableHead>
                        <TableHead className="w-32 text-right">Avg Daily Usage</TableHead>
                        <TableHead className="w-24 text-right">Stok</TableHead>
                        <TableHead className="w-32 text-right">Days of Cover</TableHead>
                        <TableHead className="w-28 text-center">Trend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {velocity.map((item, index) => (
                        <TableRow key={`${item.entitas}-${item.skuName}`}>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium max-w-xs truncate" title={item.skuName}>
                            {item.skuName}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={
                                item.entitas === 'BBB'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-sky-100 text-sky-800'
                              }
                            >
                              {item.entitas}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatNumber(item.avgDailyUsage, 2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatNumber(item.currentStock)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            {formatNumber(item.daysOfCover, 1)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={TREND_BADGE[item.trend]}>
                              <span className="inline-flex items-center gap-1">
                                {item.trend === 'UP' && <TrendingUp className="h-3 w-3" />}
                                {item.trend === 'DOWN' && <TrendingDown className="h-3 w-3" />}
                                {item.trend === 'FLAT' && <Minus className="h-3 w-3" />}
                                {item.trend}
                              </span>
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <div className="mx-auto mb-4 opacity-50 flex justify-center">{icon}</div>
      <p className="text-lg">{text}</p>
    </div>
  );
}
