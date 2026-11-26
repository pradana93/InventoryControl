'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  AlertCircle,
  Download,
  Calculator,
  Globe,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
} from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';
import { ENTITY_COLORS, Entity } from '@/lib/constants';

interface CalculatorResult {
  skuName: string;
  entitas: 'BBB' | 'BBT';
  currentStock: number;
  unitCost: number;
  avgDailyUsage: number;
  doi: number;
  leadTimeDays: number;
  safetyStockDays: number;
  coverageDays: number;
  status: 'KRITIS' | 'AMAN' | 'OVERSTOCK';
  safetyStockQty: number;
  ropQty: number;
  saranOrderQty: number;
  inventoryValue: number;
  forecast30d: number;
  forecastPerDay: number;
  forecastStatus: 'OK' | 'LOW_DATA';
  forecastMethod: string;
}

type SortKey = keyof Pick<
  CalculatorResult,
  | 'entitas'
  | 'skuName'
  | 'currentStock'
  | 'unitCost'
  | 'inventoryValue'
  | 'avgDailyUsage'
  | 'doi'
  | 'leadTimeDays'
  | 'safetyStockQty'
  | 'coverageDays'
  | 'status'
  | 'ropQty'
  | 'saranOrderQty'
  | 'forecast30d'
  | 'forecastPerDay'
>;

type SortDir = 'asc' | 'desc';

function formatRupiah(value: number): string {
  return Math.round(value || 0).toLocaleString('id-ID');
}

function formatNum(value: number, decimals = 0): string {
  if (!isFinite(value)) return '∞';
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const STATUS_BADGE: Record<CalculatorResult['status'], string> = {
  KRITIS: 'bg-red-500/20 text-red-300 border-red-500/40',
  AMAN: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  OVERSTOCK: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
};

const COLUMNS: { key: SortKey; label: string; align?: 'right' | 'left' }[] = [
  { key: 'entitas', label: 'Entitas' },
  { key: 'skuName', label: 'SKU' },
  { key: 'currentStock', label: 'Stok Saat Ini', align: 'right' },
  { key: 'unitCost', label: 'Harga Satuan', align: 'right' },
  { key: 'inventoryValue', label: 'Nilai Persediaan', align: 'right' },
  { key: 'avgDailyUsage', label: 'Pemakaian Harian', align: 'right' },
  { key: 'doi', label: 'DOI', align: 'right' },
  { key: 'leadTimeDays', label: 'LT', align: 'right' },
  { key: 'safetyStockQty', label: 'Safety Stock', align: 'right' },
  { key: 'coverageDays', label: 'Coverage', align: 'right' },
  { key: 'status', label: 'Status' },
  { key: 'ropQty', label: 'ROP', align: 'right' },
  { key: 'saranOrderQty', label: 'Saran Order', align: 'right' },
  { key: 'forecast30d', label: 'Forecast 30d', align: 'right' },
  { key: 'forecastPerDay', label: 'Forecast/Hari', align: 'right' },
];

function InventoryCalculatorPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { entity, setEntity, badge, options } = useEntity();

  const [data, setData] = useState<CalculatorResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const entityLabel = entity === 'ALL' ? 'Semua Entitas' : entity;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ent = entity === 'ALL' ? 'ALL' : entity;
      const res = await fetch(`/api/inventory/calculator?ent=${ent}`);
      if (!res.ok) throw new Error('Gagal memuat data kalkulator');
      const json: CalculatorResult[] = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role;
      if (role !== 'super-admin' && role !== 'manager') {
        router.push('/');
        return;
      }
      fetchData();
    } else if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, session, router, fetchData]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? data.filter((r) => r.skuName.toLowerCase().includes(term))
      : data;

    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv);
      } else {
        const an = typeof av === 'number' ? av : 0;
        const bn = typeof bv === 'number' ? bv : 0;
        // Infinity (no usage) sorts last regardless of direction
        if (!isFinite(an) && !isFinite(bn)) cmp = 0;
        else if (!isFinite(an)) return 1;
        else if (!isFinite(bn)) return -1;
        else cmp = an - bn;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [data, search, sortKey, sortDir]);

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const header = COLUMNS.map((c) => c.label);
    const rows = displayed.map((r) => [
      r.entitas,
      r.skuName,
      r.currentStock,
      Math.round(r.unitCost || 0),
      Math.round(r.inventoryValue || 0),
      Number(r.avgDailyUsage.toFixed(2)),
      isFinite(r.doi) ? Number(r.doi.toFixed(1)) : '∞',
      r.leadTimeDays,
      Number(r.safetyStockQty.toFixed(2)),
      isFinite(r.coverageDays) ? Number(r.coverageDays.toFixed(1)) : '∞',
      r.status,
      Number(r.ropQty.toFixed(2)),
      Number(r.saranOrderQty.toFixed(2)),
      Number(r.forecast30d.toFixed(2)),
      Number(r.forecastPerDay.toFixed(2)),
    ]);

    const wb = XLSX.utils.book_new();
    const wsData: (string | number)[][] = [];
    wsData.push(['KALKULATOR PERSEDIAAN', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    wsData.push(['Entitas:', entityLabel, '', 'Diekspor:', new Date().toLocaleString('id-ID')]);
    wsData.push([]);
    wsData.push(header);
    rows.forEach((r) => wsData.push(r));

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = header.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Kalkulator Persediaan');

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `Kalkulator-Persediaan-${date}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Kalkulator Persediaan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Perhitungan DOI, ROP, safety stock, dan forecast untuk seluruh SKU.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.badge}`}
          >
            <Globe className="h-3 w-3 mr-1" /> {entityLabel}
          </span>
          <Button onClick={handleExport} disabled={loading || displayed.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Entity filter tabs */}
        <div className="inline-flex rounded-lg border border-border p-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setEntity(opt.value as Entity)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                entity === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.short}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-64"
          />
        </div>
      </div>

      <Card className={ENTITY_COLORS[entity].bg}>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="animate-spin h-6 w-6 text-primary" />
              <p className="text-sm text-muted-foreground">Memuat kalkulator persediaan...</p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Tidak ada data untuk entitas ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((col) => (
                      <TableHead
                        key={col.key}
                        className={`whitespace-nowrap cursor-pointer select-none ${
                          col.align === 'right' ? 'text-right' : ''
                        }`}
                        onClick={() => toggleSort(col.key)}
                      >
                        <span
                          className={`inline-flex items-center gap-1 ${
                            col.align === 'right' ? 'justify-end w-full' : ''
                          }`}
                        >
                          {col.label}
                          {sortKey === col.key ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.map((row) => (
                    <TableRow key={`${row.entitas}-${row.skuName}`}>
                      <TableCell className="font-medium">{row.entitas}</TableCell>
                      <TableCell className="font-medium">{row.skuName}</TableCell>
                      <TableCell className="text-right">
                        {formatNum(row.currentStock)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatRupiah(row.unitCost)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatRupiah(row.inventoryValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNum(row.avgDailyUsage, 2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNum(row.doi, 1)}
                      </TableCell>
                      <TableCell className="text-right">{row.leadTimeDays}</TableCell>
                      <TableCell className="text-right">
                        {formatNum(row.safetyStockQty, 1)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNum(row.coverageDays, 1)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_BADGE[row.status]}`}
                        >
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNum(row.ropQty, 1)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatNum(row.saranOrderQty, 1)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNum(row.forecast30d, 1)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNum(row.forecastPerDay, 2)}
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

export default function InventoryCalculatorPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <p className="text-muted-foreground">Memuat Kalkulator Persediaan…</p>
        </div>
      }
    >
      <InventoryCalculatorPageContent />
    </Suspense>
  );
}
