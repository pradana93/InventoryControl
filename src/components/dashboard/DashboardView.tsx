'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KPICard } from '@/components/common/KPICard';
import { AlertBanner } from '@/components/common/AlertBanner';
import { TopSKUChart, ZoneChart } from '@/components/common/Charts';
import {
  FefoTimelineChart,
  AccuracyGaugeChart,
  VarianceBreakdownChart,
} from '@/components/common/RechartsViews';
import { EnhancedStockTables } from '@/components/dashboard/EnhancedStockTables';
import { useDashboardStream } from '@/hooks/useDashboardStream';
import { redirectToLoginIfUnauthorized } from '@/lib/client-auth';
import {
  RefreshCw,
  Loader2,
  Package,
  TrendingUp,
  CheckCircle,
  MinusCircle,
  PackageX,
  Radio,
  Clock,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FefoLot {
  namaBarang: string;
  nomorRak: string;
  qtySistem: number;
  daysToExpiry: number;
  expiredLabel: string;
  statusFefo: string;
  category: string;
  entitas?: string;
}

interface DashboardViewProps {
  initialEntity: 'BBB' | 'BBT' | 'ALL';
}

/**
 * Aggregates raw per-lot stock detail rows (from /api/sku?action=stock) into
 * per-SKU summary rows expected by EnhancedStockTables. The API returns lots
 * (with `qtySistem` / `soh`), not pre-aggregated SKU totals, so we roll them up.
 */
function aggregateBySku(lots: any[]): any[] {
  const map = new Map<string, any>();

  for (const lot of lots) {
    if (!lot || !lot.namaBarang) continue;
    const key = lot.namaBarang;
    const qtySystem = numOr(lot.qtySistem);
    const soh = numOr(lot.soh);
    const daysToExpiry = numOr(lot.daysToExpiry, Number.POSITIVE_INFINITY);

    const existing = map.get(key);
    if (existing) {
      existing.totalQtySystem += qtySystem;
      existing.totalSoh += soh;
      existing.rackCount += 1;
      if (lot.nomorRak) existing.racks.push(lot.nomorRak);
      if (lot.expiredLabel && lot.expiredLabel < existing.earliestExpiryDate) {
        existing.earliestExpiryDate = lot.expiredLabel;
      }
    } else {
      map.set(key, {
        namaBarang: lot.namaBarang,
        category: lot.category || '-',
        barcode: lot.barcode || '-',
        unit: lot.unit || '',
        totalQtySystem: qtySystem,
        totalSoh: soh,
        rackCount: lot.nomorRak ? 1 : 0,
        earliestExpiryDate: lot.expiredLabel || '-',
        statusFefo: lot.statusFefo || 'OK',
        racks: lot.nomorRak ? [lot.nomorRak] : [],
        moreRacks: 0,
      });
    }
    void daysToExpiry;
  }

  return Array.from(map.values()).map((row) => ({
    ...row,
    racks: row.racks.slice(0, 100),
    moreRacks: Math.max(0, row.rackCount - 3),
  }));
}

function numOr(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function DashboardView({ initialEntity }: DashboardViewProps) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;

  const { data, loading, error, connected, lastUpdated, refresh } = useDashboardStream(initialEntity);

  const [fefoData, setFefoData] = useState<FefoLot[]>([]);
  const [skuData, setSkuData] = useState<any[]>([]);
  const [detailData, setDetailData] = useState<any[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);

  // Load tables once (heavy payload, not streamed)
  useEffect(() => {
    const ent = initialEntity === 'ALL' ? '' : initialEntity;
    async function loadTables() {
      try {
        const [skuRes, detailRes] = await Promise.all([
          fetch(`/api/sku?action=stock${ent ? `&ent=${ent}` : ''}`),
          fetch(`/api/rack?action=detail${ent ? `&ent=${ent}` : ''}`),
        ]);
        if (redirectToLoginIfUnauthorized(skuRes) || redirectToLoginIfUnauthorized(detailRes)) return;
        const rawLots = skuRes.ok ? await skuRes.json() : [];
        if (detailRes.ok) setDetailData(await detailRes.json());
        setSkuData(aggregateBySku(Array.isArray(rawLots) ? rawLots : []));
      } catch (e) {
        console.error('Failed to load tables', e);
      } finally {
        setTablesLoading(false);
      }
    }
    loadTables();
  }, [initialEntity]);

  // Load FEFO lots for timeline
  useEffect(() => {
    const ent = initialEntity === 'ALL' ? '' : initialEntity;
    async function loadFefo() {
      try {
        const res = await fetch(`/api/fefo?limit=50${ent ? `&ent=${ent}` : ''}`, { cache: 'no-store' });
        if (res.ok) setFefoData(await res.json());
      } catch (e) {
        console.error('Failed to load FEFO', e);
      }
    }
    loadFefo();
  }, [lastUpdated, initialEntity]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Memuat data dari Google Sheets...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6 text-center">
          <PackageX className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-destructive mb-2">Gagal Memuat Dashboard</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Coba Lagi
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { summary, alerts, charts } = data;

  const num = (v: unknown, fallback = 0): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  const totalSKU = num(summary?.totalSKU);
  const totalSystemQty = num(summary?.totalSystemQty);
  const totalSOH = num(summary?.totalSOH);
  const variance = num(summary?.variance);
  const accuracy = num(summary?.accuracy, 100);
  const emptySlots = num(summary?.emptySlots);

  const kpiItems = [
    { title: 'Total SKU', value: totalSKU.toLocaleString(), icon: <Package className="h-8 w-8" /> },
    { title: 'Qty Sistem', value: totalSystemQty.toLocaleString(), icon: <Package className="h-8 w-8" /> },
    { title: 'Stok Fisik (SOH)', value: totalSOH.toLocaleString(), icon: <CheckCircle className="h-8 w-8" /> },
    {
      title: 'Variance',
      value: (variance >= 0 ? '+' : '') + variance.toLocaleString(),
      trend: (variance === 0 ? 'neutral' : variance > 0 ? 'up' : 'down') as 'up' | 'down' | 'neutral',
      trendValue: Math.abs(variance).toLocaleString(),
      icon: <TrendingUp className="h-8 w-8" />,
    },
    {
      title: 'Akurasi',
      value: accuracy.toFixed(1) + '%',
      trend: (accuracy >= 99 ? 'up' : accuracy >= 95 ? 'neutral' : 'down') as 'up' | 'down' | 'neutral',
      icon: <ShieldCheck className="h-8 w-8" />,
    },
    { title: 'Slot Kosong', value: emptySlots.toLocaleString(), icon: <MinusCircle className="h-8 w-8" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Status bar: real-time indicator + last updated */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <Radio
              className={cn(
                'h-4 w-4',
                connected ? 'text-emerald-500 animate-pulse' : 'text-muted-foreground'
              )}
            />
            <span className={connected ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>
              {connected ? 'Live — diperbarui tiap 30 detik' : 'Menyambung ulang...'}
            </span>
          </span>
          {role && (
            <span className="inline-flex items-center gap-1 text-muted-foreground border-l border-border pl-2 ml-1">
              <Building2 className="h-3.5 w-3.5" />
              Tampilan: {role === 'super-admin' ? 'Super Admin' : role === 'manager' ? 'Manager' : 'Operator'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && typeof lastUpdated.toLocaleTimeString === 'function' && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {lastUpdated.toLocaleTimeString('id-ID')}
            </span>
          )}
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Segarkan
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {kpiItems.map((kpi, i) => (
          <KPICard key={i} {...kpi} />
        ))}
      </div>

      {/* Alerts */}
      <AlertBanner expired={alerts?.expired ?? []} expiring={alerts?.expiring ?? []} outOfStock={alerts?.outOfStock ?? []} />

      {/* Charts Row 1: Top SKU + Zone */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopSKUChart data={charts?.topSkus ?? []} />
        <ZoneChart data={charts?.zoneDistribution ?? []} />
      </div>

      {/* Charts Row 2: FEFO Timeline + Accuracy Gauge + Variance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <FefoTimelineChart data={fefoData} />
        </div>
        <div className="flex flex-col gap-4">
          <AccuracyGaugeChart accuracy={accuracy} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <VarianceBreakdownChart
            systemQty={totalSystemQty}
            soh={totalSOH}
            variance={variance}
          />
        </div>
        <div className="lg:col-span-2">
          {/* Operator-friendly summary panel */}
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Ringkasan Operasional</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
              <SummaryTile label="Lot Expired" value={num(summary?.expiredCount)} tone="destructive" />
              <SummaryTile label="Segera Expired (30 hr)" value={num(summary?.expiringCount)} tone="warning" />
              <SummaryTile label="Stok Habis" value={num(summary?.outOfStockCount)} tone="muted" />
              <SummaryTile label="Total SOH" value={totalSOH} tone="success" />
              <SummaryTile label="Qty Sistem" value={totalSystemQty} tone="info" />
              <SummaryTile label="Akurasi" value={`${accuracy.toFixed(1)}%`} tone="success" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tables */}
      {tablesLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <EnhancedStockTables skuData={skuData} detailData={detailData} />
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'destructive' | 'warning' | 'muted' | 'success' | 'info';
}) {
  const tones: Record<string, string> = {
    destructive: 'text-destructive',
    warning: 'text-amber-600',
    muted: 'text-muted-foreground',
    success: 'text-emerald-600',
    info: 'text-sky-600',
  };
  return (
    <div className="rounded-lg border border-border p-3 bg-muted/20">
      <p className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums mt-1', tones[tone])}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}