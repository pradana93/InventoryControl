'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, Download, ArrowUpDown } from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';
import * as XLSX from 'xlsx';
import { CalculatorResult } from '@/lib/inventory-calculator';
import { filterActiveSkus } from '@/lib/warehouse-optimization';

export interface ReplenishmentItem extends CalculatorResult {
  priority: 'URGENT' | 'HIGH' | 'NORMAL';
  saranValue: number; // saranOrderQty * unitCost
}

/**
 * Filter and transform CalculatorResult items to ReplenishmentItems with priority.
 * Pure function for testability.
 */
export function filterReplenishmentItems(items: CalculatorResult[]): ReplenishmentItem[] {
  return items
    .filter((item) => item.saranOrderQty > 0 || item.status === 'KRITIS')
    .map((item): ReplenishmentItem => {
      let priority: 'URGENT' | 'HIGH' | 'NORMAL';
      if (item.status === 'KRITIS' && item.doi < 1) {
        priority = 'URGENT';
      } else if (item.status === 'KRITIS') {
        priority = 'HIGH';
      } else {
        priority = 'NORMAL';
      }
      return {
        ...item,
        priority,
        saranValue: item.saranOrderQty * item.unitCost,
      };
    })
    .sort((a, b) => {
      // Priority order: URGENT > HIGH > NORMAL
      const priorityOrder: Record<'URGENT' | 'HIGH' | 'NORMAL', number> = {
        URGENT: 0,
        HIGH: 1,
        NORMAL: 2,
      };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by saranValue descending
      return b.saranValue - a.saranValue;
    });
}

export function ReplenishmentPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { entity } = useEntity();

  const [items, setItems] = useState<ReplenishmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entParam = entity === 'ALL' ? 'BBB' : entity;
      const res = await fetch(`/api/inventory/calculator?ent=${entParam}`);
      if (!res.ok) throw new Error('Gagal memuat data kalkulator');
      const data: CalculatorResult[] = await res.json();
      setItems(filterReplenishmentItems(filterActiveSkus(data)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role as string | undefined;
      if (role !== 'super-admin' && role !== 'manager' && role !== 'operator') {
        router.push('/');
        return;
      }
      fetchData();
    } else if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [session, status, router, fetchData]);

  const handleExport = () => {
    setExporting(true);
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const fileName = `Replenishment-Priority-${dateStr}.xlsx`;

      // Prepare data for export
      const exportData = items.map((item, index) => ({
        No: index + 1,
        Entitas: item.entitas,
        SKU: item.skuName,
        Stok: item.currentStock,
        Harga: item.unitCost,
        ROP: item.ropQty,
        'Saran Order': item.saranOrderQty,
        DOI: item.doi === Infinity ? '∞' : item.doi.toFixed(1),
        Status: item.status,
        Prioritas: item.priority,
        'Nilai Saran (Rp)': item.saranValue,
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Replenishment Priority');
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Gagal mengekspor file Excel');
    } finally {
      setExporting(false);
    }
  };

  const getPriorityBadgeClass = (priority: 'URGENT' | 'HIGH' | 'NORMAL') => {
    switch (priority) {
      case 'URGENT':
        return 'border-transparent bg-destructive text-destructive-foreground';
      case 'HIGH':
        return 'border-transparent bg-amber-500 text-black';
      case 'NORMAL':
        return 'border-transparent bg-sky-500 text-white';
      default:
        return '';
    }
  };

  const getStatusBadgeVariant = (status: 'KRITIS' | 'AMAN' | 'OVERSTOCK') => {
    switch (status) {
      case 'KRITIS':
        return 'destructive';
      case 'AMAN':
        return 'default';
      case 'OVERSTOCK':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const formatNumber = (num: number) => {
    if (num === Infinity) return '∞';
    return num.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const urgentCount = items.filter((i) => i.priority === 'URGENT').length;
  const highCount = items.filter((i) => i.priority === 'HIGH').length;
  const normalCount = items.filter((i) => i.priority === 'NORMAL').length;
  const totalSaranValue = items.reduce((sum, i) => sum + i.saranValue, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pusat Tindakan Pengisian Ulang</h1>
          <p className="text-muted-foreground mt-1">
            Daftar SKU yang memerlukan tindakan pengisian ulang berdasarkan prioritas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || items.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Mengekspor...' : 'Export Excel'}
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">URGENT</p>
                <p className="text-2xl font-bold text-destructive">{urgentCount}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">DOI {'<'} 1 & Kritis</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">HIGH</p>
                <p className="text-2xl font-bold text-amber-500">{highCount}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-amber-500" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Status Kritis</p>
          </CardContent>
        </Card>
        <Card className="border-sky-500/30 bg-sky-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">NORMAL</p>
                <p className="text-2xl font-bold text-sky-500">{normalCount}</p>
              </div>
              <ArrowUpDown className="h-8 w-8 text-sky-500" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Saran Order {'>'} 0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Nilai Saran</p>
                <p className="text-2xl font-bold">{formatCurrency(totalSaranValue)}</p>
              </div>
              <ArrowUpDown className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <Card className="bg-background border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Daftar Prioritas Pengisian Ulang</CardTitle>
          <CardDescription>
            Menampilkan {items.length} item dari entitas {entity === 'ALL' ? 'Semua' : entity} yang memerlukan perhatian
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ArrowUpDown className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Tidak ada item yang memerlukan pengisian ulang</p>
              <p className="text-sm mt-1">Semua stok dalam kondisi aman</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">No</TableHead>
                    <TableHead className="w-24 text-center">Entitas</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="w-20 text-right">Stok</TableHead>
                    <TableHead className="w-28 text-right">Harga</TableHead>
                    <TableHead className="w-20 text-right">ROP</TableHead>
                    <TableHead className="w-24 text-right font-bold">Saran Order</TableHead>
                    <TableHead className="w-20 text-right">DOI</TableHead>
                    <TableHead className="w-28 text-center">Status</TableHead>
                    <TableHead className="w-28 text-center">Prioritas</TableHead>
                    <TableHead className="w-36 text-right">Nilai Saran (Rp)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={item.skuName}>
                      <TableCell className="text-center text-sm text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={item.entitas === 'BBB' ? 'default' : 'secondary'}
                          className={item.entitas === 'BBB' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}
                        >
                          {item.entitas}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium max-w-xs truncate" title={item.skuName}>{item.skuName}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{item.currentStock.toLocaleString('id-ID')}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(item.unitCost)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{item.ropQty.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</TableCell>
                      <TableCell className="text-right font-bold font-mono text-sm text-primary">
                        {item.saranOrderQty.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {item.doi === Infinity ? '∞' : item.doi.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={getStatusBadgeVariant(item.status)}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={getPriorityBadgeClass(item.priority)}>
                          {item.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(item.saranValue)}</TableCell>
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