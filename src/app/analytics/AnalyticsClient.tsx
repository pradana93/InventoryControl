'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  AlertCircle,
  Download,
  TrendingUp,
  Package,
  Wallet,
  Warehouse,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';
import type { AnalyticsResult, AnalyticsItem, AbcClass } from '@/lib/analytics';

// ============================================================================
// PURE FILTER HELPER (exported for testing)
// ============================================================================

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

// ============================================================================
// FORMAT HELPERS
// ============================================================================

const formatCurrency = (num: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num || 0);

const formatNumber = (num: number, decimals = 0) =>
  Number(num || 0).toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

// ============================================================================
// BADGE TONES
// ============================================================================

function dosTone(dos: number): string {
  if (dos < 7) return 'bg-red-500/20 text-red-300 border-red-500/40';
  if (dos <= 30) return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
}

function turnoverTone(t: number): string {
  if (t < 2) return 'bg-red-500/20 text-red-300 border-red-500/40';
  if (t <= 4) return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
}

const CLASS_BADGE: Record<AbcClass, string> = {
  A: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  B: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  C: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AnalyticsPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { entity, badge } = useEntity();

  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<AbcClass | 'ALL'>('ALL');

  const entityLabel = entity === 'ALL' ? 'Semua Entitas' : entity;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?ent=${entity}`);
      if (!res.ok) throw new Error('Gagal memuat analisis lanjutan');
      const json: AnalyticsResult = await res.json();
      setData(json);
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

  const filteredItems = data
    ? filterAnalyticsItems(data.items, { search, classification: classFilter })
    : [];

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const header = [
        'SKU',
        'Entitas',
        'Kategori',
        'Stok',
        'Harga Satuan',
        'Nilai Persediaan (Rp)',
        'Perkiraan Permintaan/Hari',
        'Perkiraan 30 Hari',
        'DOI/DOS',
        'Turnover',
        'Biaya Simpan (Rp)',
        'Klasifikasi',
      ];
      const aoa: (string | number)[][] = [
        ['ANALISIS LANJUTAN — PERFORMA PERSEDIAAN'],
        ['Entitas:', entityLabel, '', 'Diekspor:', new Date().toLocaleString('id-ID')],
        [
          'Total Nilai Persediaan (Rp):',
          Math.round(data.summary.totalInventoryValue),
          '',
          'Total Biaya Simpan (Rp):',
          Math.round(data.summary.totalCarryingCost),
        ],
        [
          'Rata-rata Turnover:',
          data.summary.avgTurnover,
          '',
          'Rata-rata DOI/DOS:',
          data.summary.avgDOS,
        ],
        [],
        header,
        ...filteredItems.map((i) => [
          i.skuName,
          i.entitas,
          i.kategori,
          i.currentStock,
          Math.round(i.unitCost),
          Math.round(i.inventoryValue),
          i.forecastDaily,
          i.forecast30d,
          i.daysOfSupply,
          i.turnover,
          Math.round(i.carryingCost),
          i.classification,
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Analisis');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Analytics-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Gagal mengekspor analisis');
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

  const summary = data?.summary;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Analisis Lanjutan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            DOI/DOS, turnover, biaya penyimpanan, dan perkiraan permintaan untuk entitas{' '}
            {entityLabel}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.badge}`}
          >
            {entityLabel}
          </span>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || !data || filteredItems.length === 0}
          >
            <Download className="h-4 w-4 mr-2" /> Export Excel
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* KPI CARDS */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Wallet className="h-4 w-4" /> Total Nilai Persediaan
              </div>
              <p className="text-2xl font-bold mt-2">
                {formatCurrency(summary.totalInventoryValue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Warehouse className="h-4 w-4" /> Total Biaya Simpan
              </div>
              <p className="text-2xl font-bold mt-2">
                {formatCurrency(summary.totalCarryingCost)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">asumsi 20% / tahun</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <RefreshCw className="h-4 w-4" /> Rata-rata Turnover
              </div>
              <p className="text-2xl font-bold mt-2">{formatNumber(summary.avgTurnover, 2)}x</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Package className="h-4 w-4" /> Rata-rata DOI/DOS
              </div>
              <p className="text-2xl font-bold mt-2">{formatNumber(summary.avgDOS, 1)} hari</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TABLE */}
      <Card className="bg-background border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg">Detail per SKU</CardTitle>
            <CardDescription>
              {filteredItems.length} dari {data?.items.length ?? 0} SKU ditampilkan
              {summary
                ? ` · A: ${summary.classA} · B: ${summary.classB} · C: ${summary.classC}`
                : ''}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari SKU atau kategori..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              {(['ALL', 'A', 'B', 'C'] as const).map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={classFilter === c ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setClassFilter(c)}
                >
                  {c === 'ALL' ? 'Semua' : `Klas ${c}`}
                </Button>
              ))}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="mx-auto mb-4 opacity-50 flex justify-center">
                <TrendingUp className="h-12 w-12" />
              </div>
              <p className="text-lg">Tidak ada data analisis</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Entitas</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead className="text-right">Nilai (Rp)</TableHead>
                    <TableHead className="text-right">Estimasi/Hari</TableHead>
                    <TableHead className="text-right">DOI/DOS</TableHead>
                    <TableHead className="text-right">Turnover</TableHead>
                    <TableHead className="text-right">Biaya Simpan (Rp)</TableHead>
                    <TableHead className="text-center">Klas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={`${item.entitas}-${item.skuId || item.skuName}`}>
                      <TableCell className="font-medium max-w-[16rem]">
                        <div className="truncate" title={item.skuName}>
                          {item.skuName}
                        </div>
                        <div className="text-xs text-muted-foreground">{item.kategori}</div>
                      </TableCell>
                      <TableCell className="text-sm">{item.entitas}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNumber(item.currentStock)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(item.inventoryValue)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNumber(item.forecastDaily, 2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={dosTone(item.daysOfSupply)}>
                          {item.daysOfSupply >= 999
                            ? '∞'
                            : `${formatNumber(item.daysOfSupply, 1)} hr`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={turnoverTone(item.turnover)}>
                          {formatNumber(item.turnover, 2)}x
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatCurrency(item.carryingCost)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={CLASS_BADGE[item.classification]}>
                          {item.classification}
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
    </div>
  );
}
