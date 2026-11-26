'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StockTables } from '@/components/dashboard/StockTables';
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { redirectToLoginIfUnauthorized } from '@/lib/client-auth';

export function DashboardTables() {
  const [skuData, setSkuData] = useState<any[]>([]);
  const [detailData, setDetailData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [skuRes, detailRes] = await Promise.all([
        fetch('/api/sku?action=stock'),
        fetch('/api/rack?action=detail'),
      ]);
      if (redirectToLoginIfUnauthorized(skuRes) || redirectToLoginIfUnauthorized(detailRes)) return;
      if (!skuRes.ok || !detailRes.ok) throw new Error('Gagal memuat data tabel');
      const [skuJson, detailJson] = await Promise.all([skuRes.json(), detailRes.json()]);
      setSkuData(skuJson);
      setDetailData(detailJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
        <p>{error}</p>
        <button onClick={fetchData} className="mt-2 text-sm text-primary hover:underline">Coba Lagi</button>
      </div>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <CardTitle className="text-lg">Data Stok Inventory</CardTitle>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </CardHeader>
      <CardContent>
        <StockTables skuData={skuData} detailData={detailData} />
      </CardContent>
    </Card>
  );
}