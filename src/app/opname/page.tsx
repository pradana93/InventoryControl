'use client';

import { useState, useEffect, useMemo } from 'react';
import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, RefreshCw, CheckCircle2, Globe, AlertTriangle, Target, TrendingUp, Search } from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';
import { ENTITY_COLORS } from '@/lib/constants';
import { filterActiveSkus } from '@/lib/warehouse-optimization';
import { useSession } from 'next-auth/react';

type ToleranceStatus = 'Akurat' | 'Toleransi' | 'Selisih';

interface OpnameRow {
  rackId: string;
  skuName: string;
  qtySistem: number;
  qtyFisikSOH: number;
  variance: number;
  selisihRp: number;
  toleranceStatus: ToleranceStatus;
  akurasi: string;
  tanggalOpname: string;
  petugas: string;
  catatan: string;
  unitCost: number;
}

function formatRupiah(value: number): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(abs);
  return value < 0 ? `-${formatted}` : formatted;
}

const STATUS_BADGE: Record<ToleranceStatus, string> = {
  Akurat: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  Toleransi: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  Selisih: 'bg-red-500/20 text-red-300 border-red-500/40',
};

function StockOpnamePageContent() {
  const { entity, badge } = useEntity();
  const { data: session } = useSession();
  const petugasName =
    (session?.user as any)?.name || session?.user?.email || 'Unknown';

  const [data, setData] = useState<OpnameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<'priority' | 'all'>('priority');
  const [search, setSearch] = useState('');

  const entityLabel = entity === 'ALL' ? 'Semua Entitas' : entity;

  async function loadData() {
    setLoading(true);
    try {
      const ent = entity === 'ALL' ? '' : entity;
      const [res, catalogRes] = await Promise.all([
        fetch(`/api/stock-opname?action=list${ent ? `&ent=${ent}` : ''}`),
        fetch('/api/sku?action=list'),
      ]);
      if (res.ok) {
        const rows: OpnameRow[] = await res.json();

        // Cross-reference with the catalog's activeFlag so inactive/archived
        // SKUs never appear in the opname work list. Missing flag = active.
        const catalogEntries = catalogRes.ok ? await catalogRes.json() : [];
        const activeNames = new Set(
          filterActiveSkus(catalogEntries)
            .map((c: any) => c.namaBarang?.toLowerCase())
            .filter(Boolean)
        );
        const activeRows =
          activeNames.size === 0
            ? rows
            : rows.filter((r) => activeNames.has(r.skuName.toLowerCase()));

        setData(activeRows);
      }
    } catch (e) {
      console.error('Failed to load', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [entity]);

  async function handleSave(rackId: string, skuName: string, soh: number) {
    setSaving({ ...saving, [`${rackId}-${skuName}`]: true });
    setMessage(null);
    try {
      const res = await fetch('/api/stock-opname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rackId,
          skuName,
          qtyFisikSOH: soh,
          petugas: petugasName,
          catatan: 'Cycle count harian',
        }),
      });
      if (res.ok) {
        setMessage(`Rak ${rackId} (${skuName}) berhasil disimpan.`);
        loadData();
      } else {
        alert('Gagal menyimpan');
      }
    } catch (e) {
      alert('Gagal menyimpan stok fisik');
    } finally {
      setSaving({ ...saving, [`${rackId}-${skuName}`]: false });
    }
  }

  async function handleSync() {
    setLoading(true);
    try {
      await fetch('/api/stock-opname?action=sync');
      setMessage('Sinkronisasi berhasil.');
      loadData();
    } catch (e) {
      alert('Gagal sinkronisasi');
    } finally {
      setLoading(false);
    }
  }

  // ---- Summary metrics -----------------------------------------------------
  const metrics = useMemo(() => {
    const counted = data.length;
    const accurate = data.filter((d) => d.toleranceStatus === 'Akurat').length;
    const toleransi = data.filter((d) => d.toleranceStatus === 'Toleransi').length;
    const selisih = data.filter((d) => d.toleranceStatus === 'Selisih').length;
    const totalSelisihRp = data.reduce((sum, d) => sum + (d.selisihRp || 0), 0);

    // Weighted accuracy: average of per-row accuracy values (already % strings)
    const avgAccuracy =
      counted > 0
        ? data.reduce((sum, d) => sum + (parseFloat(d.akurasi) || 0), 0) / counted
        : 100;

    return { counted, accurate, toleransi, selisih, totalSelisihRp, avgAccuracy };
  }, [data]);

  // ---- Priority queue ------------------------------------------------------
  // Ranking: high absolute Rupiah variance first, then high unit value,
  // then large unit variance, then general rotation (lowest accuracy first).
  const priorityQueue = useMemo(() => {
    const priorityScore = (row: OpnameRow) => {
      const absRp = Math.abs(row.selisihRp || 0);
      const absVar = Math.abs(row.variance || 0);
      const rpWeight = absRp; // dominant driver
      const valueWeight = (row.unitCost || 0) * 0.05;
      const varWeight = absVar * 100;
      const statusBoost =
        row.toleranceStatus === 'Selisih' ? 1e9 : row.toleranceStatus === 'Toleransi' ? 1e6 : 0;
      return statusBoost + rpWeight + valueWeight + varWeight;
    };

    return [...data]
      .sort((a, b) => priorityScore(b) - priorityScore(a))
      .slice(0, 20);
  }, [data]);

  const displayed = useMemo(() => {
    if (tab === 'priority') return priorityQueue;
    const term = search.trim().toLowerCase();
    const base = term
      ? data.filter(
          (d) =>
            d.skuName.toLowerCase().includes(term) ||
            d.rackId.toLowerCase().includes(term)
        )
      : data;
    return base;
  }, [tab, priorityQueue, data, search]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Opname (Cycle Count)</h1>
          <p className="text-sm text-muted-foreground">
            Input stok fisik (SOH) per rack/pallet. Prioritas dihitung otomatis dari nilai selisih Rupiah, unit cost, dan status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSync} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Sinkron Sistem
            </Button>
          </div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.badge}`}>
            <Globe className="h-3 w-3 mr-1" /> {entityLabel}
          </span>
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total SKU Dihitung</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.counted.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.accurate} akurat · {metrics.toleransi} toleransi · {metrics.selisih} selisih
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tingkat Akurasi (Overall)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.avgAccuracy >= 99 ? 'text-emerald-400' : metrics.avgAccuracy >= 95 ? 'text-amber-400' : 'text-red-400'}`}>
              {metrics.avgAccuracy.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Rata-rata akurasi per baris</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Selisih Rupiah</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${metrics.totalSelisihRp !== 0 ? 'text-red-400' : 'text-emerald-400'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.totalSelisihRp < 0 ? 'text-red-400' : metrics.totalSelisihRp > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {formatRupiah(metrics.totalSelisihRp)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Nilai bersih variance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Item Perlu Investigasi</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${metrics.selisih > 0 ? 'text-red-400' : 'text-emerald-400'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.selisih > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {metrics.selisih.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Melebihi toleransi (&gt;1 unit / 1%)</p>
          </CardContent>
        </Card>
      </div>

      <Card className={ENTITY_COLORS[entity].bg}>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>{tab === 'priority' ? 'Prioritas Hari Ini' : 'Semua SKU'}</CardTitle>
            <div className="flex items-center gap-2">
              {tab === 'all' && (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari SKU / Rak..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 w-56"
                  />
                </div>
              )}
              <div className="inline-flex rounded-lg border border-border p-1">
                <button
                  onClick={() => setTab('priority')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${tab === 'priority' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Prioritas Hari Ini
                </button>
                <button
                  onClick={() => setTab('all')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${tab === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Semua SKU
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="animate-spin h-6 w-6 text-primary" />
              <p className="text-sm text-muted-foreground">Memuat data Stock Opname...</p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Belum ada data opname untuk entitas ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rak</TableHead>
                    <TableHead>Nama Barang</TableHead>
                    <TableHead className="text-right">Harga Satuan</TableHead>
                    <TableHead className="text-right">Stok Sistem</TableHead>
                    <TableHead className="text-right">Stok Fisik (SOH)</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Selisih Rp</TableHead>
                    <TableHead className="text-right">Akurasi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.map((row) => (
                    <TableRow key={`${row.rackId}-${row.skuName}`}>
                      <TableCell className="font-medium">{row.rackId}</TableCell>
                      <TableCell>{row.skuName}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatRupiah(row.unitCost || 0)}
                      </TableCell>
                      <TableCell className="text-right">{row.qtySistem.toLocaleString()}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          defaultValue={row.qtyFisikSOH}
                          className="w-28 ml-auto text-right"
                          onBlur={(e) => handleSave(row.rackId, row.skuName, parseFloat(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${row.variance !== 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                        {row.variance > 0 ? `+${row.variance.toLocaleString()}` : row.variance.toLocaleString()}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${row.selisihRp < 0 ? 'text-red-400' : row.selisihRp > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {formatRupiah(row.selisihRp || 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{row.akurasi}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_BADGE[row.toleranceStatus] || STATUS_BADGE.Akurat}`}>
                          {row.toleranceStatus}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {saving[`${row.rackId}-${row.skuName}`] ? (
                          <Loader2 className="animate-spin h-4 w-4 inline text-primary" />
                        ) : (
                          <Save className="h-4 w-4 inline text-muted-foreground hover:text-foreground" />
                        )}
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

export default function StockOpnamePage() {
  return (
    <Suspense fallback={<div className="p-6"><div className="container mx-auto"><p className="text-muted-foreground">Memuat Stock Opname…</p></div></div>}>
      <StockOpnamePageContent />
    </Suspense>
  );
}
