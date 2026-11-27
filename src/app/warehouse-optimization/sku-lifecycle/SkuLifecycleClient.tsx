'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, Undo2, SquarePen } from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';

interface SkuLifecycleItem {
  skuId: string;
  namaBarang: string;
  entitas: 'BBB' | 'BBT';
  activeFlag: boolean;
  currentStock: number;
  inventoryValue: number;
  status: string;
}

export const toggleSkuActiveFlag = async (skuId: string, activeFlag: boolean): Promise<void> => {
  const response = await fetch(`/api/catalog/${skuId}/active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activeFlag }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Failed to update SKU ${skuId}`);
  }
};

export const bulkToggleActiveFlag = async (skuIds: string[], activeFlag: boolean): Promise<void> => {
  const promises = skuIds.map(skuId => toggleSkuActiveFlag(skuId, activeFlag));
  await Promise.all(promises);
};

export function SkuLifecyclePageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { entity } = useEntity();

  const [skus, setSkus] = useState<SkuLifecycleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkuIds, setSelectedSkuIds] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const userRole = (session?.user as any)?.role;
  const canEdit = userRole === 'super-admin' || userRole === 'manager';

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedSkuIds(new Set());
    try {
      const entParam = entity === 'ALL' ? '' : `?ent=${entity}`;
      const [catalogRes, stockRes] = await Promise.all([
        fetch(`/api/catalog${entParam}`),
        fetch(`/api/inventory/calculator${entParam}`)
      ]);
      if (!catalogRes.ok || !stockRes.ok) throw new Error('Gagal memuat data');
      const catalogData = await catalogRes.json();
      const stockData = await stockRes.json();
      
      const items = catalogData.map((entry: any) => {
        const stock = stockData.find((s: any) => s.skuName === entry.namaBarang && s.entitas === entry.entitas);
        return {
          skuId: entry.skuId,
          namaBarang: entry.namaBarang,
          entitas: entry.entitas,
          activeFlag: entry.activeFlag ?? true,
          currentStock: stock?.currentStock ?? 0,
          inventoryValue: stock?.inventoryValue ?? 0,
          status: entry.activeFlag ? 'Aktif' : 'Nonaktif',
        };
      });
      setSkus(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    if (status === 'authenticated') fetchData();
    else if (status === 'unauthenticated') router.push('/login');
  }, [status, fetchData, router]);

  const handleToggleActiveFlag = async (skuId: string, currentFlag: boolean) => {
    try {
      await toggleSkuActiveFlag(skuId, !currentFlag);
      setSkus(prev => prev.map(s => s.skuId === skuId ? { ...s, activeFlag: !currentFlag, status: !currentFlag ? 'Aktif' : 'Nonaktif' } : s));
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal'); }
  };

  const handleBulkToggle = async (flag: boolean) => {
    setIsBulkUpdating(true);
    try {
      await bulkToggleActiveFlag(Array.from(selectedSkuIds), flag);
      setSkus(prev => prev.map(s => selectedSkuIds.has(s.skuId) ? { ...s, activeFlag: flag, status: flag ? 'Aktif' : 'Nonaktif' } : s));
      setSelectedSkuIds(new Set());
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal'); }
    finally { setIsBulkUpdating(false); }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between">
        <h1 className="text-2xl font-bold">Manajemen Siklus SKU</h1>
        {canEdit && (
          <div className="space-x-2">
            <Button onClick={() => handleBulkToggle(true)} disabled={!selectedSkuIds.size || isBulkUpdating}>Aktifkan</Button>
            <Button variant="destructive" onClick={() => handleBulkToggle(false)} disabled={!selectedSkuIds.size || isBulkUpdating}>Nonaktifkan</Button>
          </div>
        )}
      </div>
      {error && <div className="text-destructive p-4 border border-destructive/20 rounded">{error}</div>}
      <Card>
        <CardContent className="p-4">
          {loading ? <Loader2 className="animate-spin h-8 w-8 mx-auto" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  {canEdit && <TableHead className="w-12"><input type="checkbox" onChange={(e) => e.target.checked ? setSelectedSkuIds(new Set(skus.map(s => s.skuId))) : setSelectedSkuIds(new Set())} /></TableHead>}
                  <TableHead>SKU ID</TableHead>
                  <TableHead>Nama Barang</TableHead>
                  <TableHead>Stok</TableHead>
                  <TableHead>Nilai</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skus.map(s => (
                  <TableRow key={s.skuId}>
                    {canEdit && <TableCell><input type="checkbox" checked={selectedSkuIds.has(s.skuId)} onChange={() => setSelectedSkuIds(prev => { const n = new Set(prev); n.has(s.skuId) ? n.delete(s.skuId) : n.add(s.skuId); return n; })} /></TableCell>}
                    <TableCell>{s.skuId}</TableCell>
                    <TableCell>{s.namaBarang}</TableCell>
                    <TableCell>{s.currentStock}</TableCell>
                    <TableCell>{s.inventoryValue}</TableCell>
                    <TableCell><Badge variant={s.activeFlag ? 'default' : 'secondary'}>{s.status}</Badge></TableCell>
                    <TableCell><Button variant="outline" size="sm" onClick={() => handleToggleActiveFlag(s.skuId, s.activeFlag)}>{s.activeFlag ? 'Nonaktifkan' : 'Aktifkan'}</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
