'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, FileSpreadsheet, PackageSearch } from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';
import {
  computeAbcClassification,
  computeSlottingRecommendations,
  ABC_ZONE,
  ABC_PRIORITY,
  ABC_PRIORITY_LABEL,
  DEFAULT_ABC_WINDOW_DAYS,
} from '@/lib/slotting';
import type {
  AbcClassification,
  AbcClassificationResult,
  SlottingRecommendation,
  SkuLifecycleItem,
} from '@/lib/slotting';

// Re-export pure functions + types so tests import them from the client module.
export {
  computeAbcClassification,
  computeSlottingRecommendations,
  ABC_ZONE,
  ABC_PRIORITY,
  ABC_PRIORITY_LABEL,
  DEFAULT_ABC_WINDOW_DAYS,
};
export type {
  AbcClassification,
  AbcClassificationResult,
  SlottingRecommendation,
  SkuLifecycleItem,
};

// ============================================================================
// FORMAT HELPERS
// ============================================================================

const formatNumber = (num: number, decimals = 0) =>
  Number(num || 0).toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const ENTITY_BADGE: Record<string, string> = {
  BBB: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  BBT: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
};

const CLASS_BADGE: Record<AbcClassification, string> = {
  A: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  B: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  C: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SlottingPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { entity, badge } = useEntity();

  const [rows, setRows] = useState<SlottingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const entityLabel = entity === 'ALL' ? 'Semua Entitas' : entity;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/warehouse/slotting?ent=${entity}`);
      if (!res.ok) throw new Error('Gagal memuat rekomendasi slotting');
      const json: SlottingRecommendation[] = await res.json();
      setRows(Array.isArray(json) ? json : []);
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

  const classCounts = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc[r.classification] += 1;
        return acc;
      },
      { A: 0, B: 0, C: 0 } as Record<AbcClassification, number>
    );
  }, [rows]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const date = new Date().toISOString().slice(0, 10);
      const header = ['SKU', 'Rak Saat Ini', 'Saran Rak', 'Prioritas'];
      const aoa: (string | number)[][] = [
        ['DAFTAR PEMINDAHAN SLOTTING'],
        ['Entitas:', entityLabel, '', 'Diekspor:', new Date().toLocaleString('id-ID')],
        [],
        header,
        ...rows.map((r) => [r.skuName, r.currentRak, r.suggestedRak, r.priorityLabel]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = header.map((h) => ({ wch: Math.max(16, h.length + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Slotting Move List');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Slotting-Move-List-${date}.xlsx`;
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
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-primary" />
            Optimasi Slotting
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Rekomendasi penempatan rak berdasarkan klasifikasi ABC (volume keluar {DEFAULT_ABC_WINDOW_DAYS}{' '}
            hari) untuk entitas {entityLabel}.
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
            onClick={handleExport}
            disabled={exporting || rows.length === 0}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Slotting Move List
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* ABC summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Kelas A (Cepat)</p>
            <p className="text-2xl font-bold text-emerald-400">{classCounts.A}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Kelas B (Sedang)</p>
            <p className="text-2xl font-bold text-yellow-400">{classCounts.B}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Kelas C (Lambat)</p>
            <p className="text-2xl font-bold text-slate-300">{classCounts.C}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-background border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Rekomendasi Pemindahan Rak</CardTitle>
          <CardDescription>
            {rows.length} SKU aktif · diurutkan dari prioritas pemindahan tertinggi
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="mx-auto mb-4 opacity-50 flex justify-center">
                <PackageSearch className="h-12 w-12" />
              </div>
              <p className="text-lg">Tidak ada rekomendasi slotting</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">No</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="w-24 text-center">Entitas</TableHead>
                    <TableHead className="w-28 text-center">Klasifikasi</TableHead>
                    <TableHead className="w-28 text-right">Stok Saat Ini</TableHead>
                    <TableHead className="w-32 text-right">Volumetrik 90 Hari</TableHead>
                    <TableHead className="w-28 text-center">Rak Saat Ini</TableHead>
                    <TableHead className="w-28 text-center">Saran Rak</TableHead>
                    <TableHead className="w-40 text-center">Prioritas</TableHead>
                    <TableHead className="w-28 text-center">Last Keluar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, index) => (
                    <TableRow key={`${r.entitas}-${r.skuId || r.skuName}`}>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-medium max-w-xs truncate" title={r.skuName}>
                        {r.skuName}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={ENTITY_BADGE[r.entitas]}>
                          {r.entitas}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={CLASS_BADGE[r.classification]}>
                          {r.classification}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(r.currentStock)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(r.volume)}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm text-muted-foreground">
                        {r.currentRak}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm font-semibold text-primary">
                        {r.suggestedRak}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {r.priorityLabel}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {r.daysSinceLastOutbound === 'N/A'
                          ? 'N/A'
                          : `${r.daysSinceLastOutbound} hari`}
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
