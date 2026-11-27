'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/common/EmptyState';
import {
  Loader2,
  AlertCircle,
  Download,
  ShieldCheck,
  ScrollText,
  Scale,
  Search,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';
import type { AuditLogEntry } from '@/lib/audit';
import type { CatalogEntry, InventoryLot, LedgerEntry } from '@/lib/db';
import { filterActiveSkus } from '@/lib/warehouse-optimization';

// ============================================================================
// TYPES
// ============================================================================

export type EntityFilter = 'BBB' | 'BBT' | 'ALL';

export interface SoxReconciliation {
  entity: EntityFilter;
  asOf: string;
  bookValue: number;
  physicalValue: number;
  difference: number;
  variancePercent: number;
  exceedsTolerance: boolean;
  skuCount: number;
  lotCount: number;
  totalQty: number;
  ledgerMovementValue: number;
  generatedAt: string;
}

export interface AuditFilters {
  action?: string;
  tableName?: string;
  recordId?: string;
}

// ============================================================================
// PURE COMPUTATION FUNCTIONS (exported for testing)
// ============================================================================

/**
 * Filter audit log rows client-side. All filters are case-insensitive and
 * partial (substring) matches so the UI search behaves forgivingly.
 * An empty/undefined filter is ignored.
 */
export function filterAuditLogs(logs: AuditLogEntry[], filters: AuditFilters): AuditLogEntry[] {
  const action = filters.action?.trim().toLowerCase();
  const tableName = filters.tableName?.trim().toLowerCase();
  const recordId = filters.recordId?.trim().toLowerCase();

  return logs.filter((log) => {
    if (action && !String(log.action).toLowerCase().includes(action)) return false;
    if (tableName && !String(log.tableName).toLowerCase().includes(tableName)) return false;
    if (recordId && !(log.recordId || '').toLowerCase().includes(recordId)) return false;
    return true;
  });
}

/**
 * SOX valuation reconciliation.
 *
 * Book Value     = sum(activeCatalog.unitCost * on-hand qty per SKU)
 * Physical Value = sum(lot.qtySistem * catalog cost basis) for active SKUs
 * difference     = physicalValue - bookValue
 * variancePercent= |difference| / bookValue * 100 (0 when bookValue = 0)
 *
 * Lots for SKUs absent from the active master contribute 0 to physicalValue
 * (orphan stock), which is the primary source of a non-zero variance.
 */
export function computeSoxReconciliation(
  catalog: CatalogEntry[],
  lots: InventoryLot[],
  ledger: LedgerEntry[] = [],
  entity: EntityFilter = 'ALL'
): SoxReconciliation {
  const activeCatalog = filterActiveSkus(catalog);
  const costByName = new Map(
    activeCatalog.map((c) => [c.namaBarang.toLowerCase(), c.unitCost || 0])
  );

  const qtyByName = new Map<string, number>();
  for (const lot of lots) {
    if (lot.qtySistem <= 0) continue;
    const key = lot.namaBarang.toLowerCase();
    qtyByName.set(key, (qtyByName.get(key) || 0) + lot.qtySistem);
  }

  let bookValue = 0;
  let totalQty = 0;
  for (const entry of activeCatalog) {
    const qty = qtyByName.get(entry.namaBarang.toLowerCase()) || 0;
    if (qty <= 0) continue;
    bookValue += (entry.unitCost || 0) * qty;
    totalQty += qty;
  }

  let physicalValue = 0;
  let lotCount = 0;
  for (const lot of lots) {
    if (lot.qtySistem <= 0) continue;
    const unitCost = costByName.get(lot.namaBarang.toLowerCase());
    if (unitCost === undefined) continue;
    physicalValue += lot.qtySistem * unitCost;
    lotCount++;
  }

  const difference = physicalValue - bookValue;
  const variancePercent = bookValue > 0 ? (Math.abs(difference) / bookValue) * 100 : 0;

  const ledgerMovementValue = ledger.reduce((sum, e) => {
    const unitCost = costByName.get(e.skuName.toLowerCase());
    if (unitCost === undefined) return sum;
    return sum + e.qtyIn * unitCost;
  }, 0);

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    entity,
    asOf: new Date().toISOString(),
    bookValue: round2(bookValue),
    physicalValue: round2(physicalValue),
    difference: round2(difference),
    variancePercent: round2(variancePercent),
    exceedsTolerance: variancePercent > 1,
    skuCount: activeCatalog.length,
    lotCount,
    totalQty,
    ledgerMovementValue: round2(ledgerMovementValue),
    generatedAt: new Date().toISOString(),
  };
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

const formatTimestamp = (iso: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ACTION_BADGE: Record<string, string> = {
  INSERT: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  UPDATE: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  DELETE: 'bg-red-500/20 text-red-300 border-red-500/40',
  OPNAME: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  CONFIRM: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  TOGGLE: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

/** Render a JSON snapshot compactly for the table cell. */
function summarizeValues(values: Record<string, unknown> | null): string {
  if (!values) return '—';
  const keys = Object.keys(values);
  if (keys.length === 0) return '{}';
  return keys.map((k) => `${k}: ${String(values[k])}`).join(', ');
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AuditPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { entity, badge } = useEntity();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [reconciliation, setReconciliation] = useState<SoxReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Audit log filters
  const [actionFilter, setActionFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [recordFilter, setRecordFilter] = useState('');

  const entityLabel = entity === 'ALL' ? 'Semua Entitas' : entity;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logsRes, soxRes] = await Promise.all([
        fetch(`/api/audit?ent=${entity}`),
        fetch(`/api/compliance/sox?ent=${entity}`),
      ]);

      if (!logsRes.ok) throw new Error('Gagal memuat audit log');
      if (!soxRes.ok) throw new Error('Gagal memuat rekonsiliasi SOX');

      const logsJson: { logs: AuditLogEntry[] } = await logsRes.json();
      const soxJson: { reconciliation: SoxReconciliation } = await soxRes.json();

      setLogs(logsJson.logs || []);
      setReconciliation(soxJson.reconciliation || null);
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

  const filteredLogs = useMemo(
    () =>
      filterAuditLogs(logs, {
        action: actionFilter,
        tableName: tableFilter,
        recordId: recordFilter,
      }),
    [logs, actionFilter, tableFilter, recordFilter]
  );

  // --------------------------------------------------------------------------
  // Excel exports
  // --------------------------------------------------------------------------
  const handleExportLogs = async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const header = [
        'Timestamp',
        'Pengguna',
        'Aksi',
        'Tabel',
        'Record ID',
        'Nilai Lama',
        'Nilai Baru',
      ];
      const aoa: (string | number)[][] = [
        ['AUDIT TRAIL — LOG AUDIT'],
        ['Entitas:', entityLabel, '', 'Diekspor:', new Date().toLocaleString('id-ID')],
        ['Total Baris:', filteredLogs.length],
        [],
        header,
        ...filteredLogs.map((l) => [
          formatTimestamp(l.timestamp),
          l.userEmail,
          l.action,
          l.tableName,
          l.recordId || '-',
          summarizeValues(l.oldValues),
          summarizeValues(l.newValues),
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = header.map((h) => ({ wch: Math.max(16, h.length + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Audit-Log-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Gagal mengekspor log audit');
    } finally {
      setExporting(false);
    }
  };

  const handleExportReconciliation = async () => {
    if (!reconciliation) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const r = reconciliation;
      const header = ['Item', 'Nilai (Rp)'];
      const aoa: (string | number)[][] = [
        ['LAPORAN REKONSILIASI SOX — VALUASI PERSEDIAAN'],
        ['Entitas:', entityLabel, '', 'Per Tanggal:', formatTimestamp(r.asOf)],
        [],
        header,
        ['Nilai Buku (Book Value)', Math.round(r.bookValue)],
        ['Nilai Fisik (Physical Value)', Math.round(r.physicalValue)],
        ['Selisih (Difference)', Math.round(r.difference)],
        ['Varians (%)', r.variancePercent],
        ['Status Toleransi', r.exceedsTolerance ? 'DI LUAR TOLERANSI (>1%)' : 'Dalam Toleransi'],
        [],
        ['Jumlah SKU Aktif', r.skuCount],
        ['Jumlah Lot', r.lotCount],
        ['Total Qty', r.totalQty],
        ['Nilai Pergerakan Ledger', Math.round(r.ledgerMovementValue)],
        [],
        ['Dibuat:', formatTimestamp(r.generatedAt)],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 34 }, { wch: 22 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rekonsiliasi SOX');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rekonsiliasi-SOX-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Gagal mengekspor laporan rekonsiliasi');
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

  let varianceTone = 'text-emerald-400';
  let varianceBadge = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (reconciliation) {
    if (reconciliation.variancePercent > 5) {
      varianceTone = 'text-red-400';
      varianceBadge = 'bg-red-500/20 text-red-300 border-red-500/40';
    } else if (reconciliation.variancePercent > 1) {
      varianceTone = 'text-amber-400';
      varianceBadge = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Audit &amp; Kepatuhan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Log audit perubahan data dan rekonsiliasi valuasi persediaan SOX untuk entitas{' '}
            {entityLabel}.
          </p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.badge}`}
        >
          {entityLabel}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs">Log Audit</TabsTrigger>
          <TabsTrigger value="sox">Rekonsiliasi SOX</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {/* Tab 1: Audit Logs                                                 */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="logs">
          <Card className="bg-background border-border">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ScrollText className="h-5 w-5 text-primary" />
                  Log Audit
                </CardTitle>
                <CardDescription>
                  {filteredLogs.length} dari {logs.length} baris ditampilkan
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportLogs}
                disabled={exporting || filteredLogs.length === 0}
              >
                <Download className="h-4 w-4 mr-2" /> Export Audit Logs
              </Button>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Filter aksi (INSERT, UPDATE...)"
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Filter tabel (catalog, ledger...)"
                    value={tableFilter}
                    onChange={(e) => setTableFilter(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Filter Record ID"
                    value={recordFilter}
                    onChange={(e) => setRecordFilter(e.target.value)}
                  />
                </div>
              </div>

              {filteredLogs.length === 0 ? (
                <EmptyState
                  title="Tidak ada log audit"
                  description="Belum ada aktivitas yang tercatat untuk filter ini. Log akan muncul setelah ada perubahan data."
                  icon={ScrollText}
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-40">Timestamp</TableHead>
                        <TableHead className="w-48">Pengguna</TableHead>
                        <TableHead className="w-24">Aksi</TableHead>
                        <TableHead className="w-32">Tabel</TableHead>
                        <TableHead className="w-32">Record ID</TableHead>
                        <TableHead>Nilai Lama</TableHead>
                        <TableHead>Nilai Baru</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatTimestamp(log.timestamp)}
                          </TableCell>
                          <TableCell className="text-sm max-w-[12rem] truncate" title={log.userEmail}>
                            {log.userEmail}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={ACTION_BADGE[log.action] || ACTION_BADGE.TOGGLE}
                            >
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-mono">{log.tableName}</TableCell>
                          <TableCell className="text-sm font-mono text-muted-foreground">
                            {log.recordId || '—'}
                          </TableCell>
                          <TableCell
                            className="text-xs text-muted-foreground max-w-[14rem] truncate"
                            title={summarizeValues(log.oldValues)}
                          >
                            {summarizeValues(log.oldValues)}
                          </TableCell>
                          <TableCell
                            className="text-xs text-muted-foreground max-w-[14rem] truncate"
                            title={summarizeValues(log.newValues)}
                          >
                            {summarizeValues(log.newValues)}
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
        {/* Tab 2: SOX Reconciliation                                         */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="sox">
          <Card className="bg-background border-border">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Scale className="h-5 w-5 text-primary" />
                  Rekonsiliasi Valuasi SOX
                </CardTitle>
                <CardDescription>
                  Nilai buku vs nilai fisik untuk entitas {entityLabel}
                  {reconciliation ? ` · per ${formatTimestamp(reconciliation.asOf)}` : ''}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportReconciliation}
                disabled={exporting || !reconciliation}
              >
                <Download className="h-4 w-4 mr-2" /> Export Reconciliation Report
              </Button>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {!reconciliation ? (
                <EmptyState
                  title="Tidak ada data rekonsiliasi"
                  description="Data persediaan atau ledger belum tersedia untuk dihitung."
                  icon={Scale}
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Nilai Buku (Book)</p>
                        <p className="text-2xl font-bold">
                          {formatCurrency(reconciliation.bookValue)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Nilai Fisik (Physical)</p>
                        <p className="text-2xl font-bold">
                          {formatCurrency(reconciliation.physicalValue)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Selisih (Difference)</p>
                        <p className={`text-2xl font-bold ${varianceTone}`}>
                          {formatCurrency(reconciliation.difference)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Varians</p>
                        <p className={`text-2xl font-bold ${varianceTone}`}>
                          {formatNumber(reconciliation.variancePercent, 2)}%
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div
                    className={`flex items-center gap-3 p-4 rounded-lg border ${
                      reconciliation.exceedsTolerance
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    }`}
                  >
                    {reconciliation.exceedsTolerance ? (
                      <AlertTriangle className="h-5 w-5" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5" />
                    )}
                    <div className="text-sm">
                      {reconciliation.exceedsTolerance ? (
                        <>
                          <span className="font-semibold">Perhatian:</span> varians{' '}
                          {formatNumber(reconciliation.variancePercent, 2)}% melebihi toleransi SOX
                          1%. Telusuri SKU tanpa master katalog aktif (orphan stock) atau harga
                          satuan yang hilang.
                        </>
                      ) : (
                        <>
                          <span className="font-semibold">Dalam toleransi SOX</span> — nilai buku
                          dan nilai fisik selaras (≤ 1%).
                        </>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Metrik</TableHead>
                          <TableHead className="text-right">Nilai</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>Nilai Buku (Book Value)</TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(reconciliation.bookValue)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Nilai Fisik (Physical Value)</TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(reconciliation.physicalValue)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Selisih (Difference)</TableCell>
                          <TableCell className={`text-right font-mono font-semibold ${varianceTone}`}>
                            {formatCurrency(reconciliation.difference)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Varians (%)</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className={varianceBadge}>
                              {formatNumber(reconciliation.variancePercent, 2)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Jumlah SKU Aktif</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatNumber(reconciliation.skuCount)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Jumlah Lot</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatNumber(reconciliation.lotCount)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Total Qty</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatNumber(reconciliation.totalQty)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Nilai Pergerakan Ledger (periode)</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatCurrency(reconciliation.ledgerMovementValue)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
