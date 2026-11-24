'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KPICard } from '@/components/common/KPICard';
import { AlertBanner } from '@/components/common/AlertBanner';
import { TopSKUChart, ZoneChart } from '@/components/common/Charts';
import { StockTables } from '@/components/dashboard/StockTables';
import { RefreshCw, Loader2, Package, TrendingUp, AlertTriangle, CheckCircle, MinusCircle, PackageX } from 'lucide-react';

interface DashboardData {
  summary: {
    totalSKU: number;
    totalSystemQty: number;
    totalSOH: number;
    variance: number;
    accuracy: number;
    expiredCount: number;
    expiringCount: number;
    outOfStockCount: number;
    emptySlots: number;
  };
  alerts: {
    expired: Array<{ namaBarang: string; nomorRak: string; qty: number; expiredDate: string }>;
    expiring: Array<{ namaBarang: string; nomorRak: string; qty: number; expiredDate: string; daysLeft: number }>;
    outOfStock: string[];
  };
  charts: {
    topSkus: Array<{ namaBarang: string; qty: number }>;
    zoneDistribution: Array<{ zone: string; qty: number }>;
  };
  inventory: Array<any>;
}

export function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Gagal memuat data dashboard');
      const json = await res.json();
      setData(json);
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
      <Card className="border-destructive">
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-destructive mb-2">Gagal Memuat Dashboard</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
            Coba Lagi
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { summary, alerts, charts } = data;

  const kpiItems = [
    { title: 'Total SKU', value: summary.totalSKU.toLocaleString(), icon: <Package className="h-8 w-8" /> },
    { title: 'Total Qty Sistem', value: summary.totalSystemQty.toLocaleString(), icon: <Package className="h-8 w-8" /> },
    { title: 'Total SOH', value: summary.totalSOH.toLocaleString(), icon: <CheckCircle className="h-8 w-8" /> },
    { 
      title: 'Variance', 
      value: (summary.variance >= 0 ? '+' : '') + summary.variance.toLocaleString(), 
      trend: (summary.variance === 0 ? 'neutral' : summary.variance > 0 ? 'up' : 'down') as 'up' | 'down' | 'neutral',
      trendValue: Math.abs(summary.variance).toLocaleString(),
      icon: <TrendingUp className="h-8 w-8" />
    },
    { 
      title: 'Akurasi', 
      value: summary.accuracy.toFixed(1) + '%', 
      trend: (summary.accuracy >= 99 ? 'up' : summary.accuracy >= 95 ? 'neutral' : 'down') as 'up' | 'down' | 'neutral',
      icon: <CheckCircle className="h-8 w-8" />
    },
    { title: 'Slot Kosong', value: summary.emptySlots.toLocaleString(), icon: <MinusCircle className="h-8 w-8" /> },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiItems.map((kpi, i) => (
          <KPICard key={i} {...kpi} />
        ))}
      </div>

      {/* Alert Banners */}
      <AlertBanner
        expired={alerts.expired}
        expiring={alerts.expiring}
        outOfStock={alerts.outOfStock}
      />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopSKUChart data={charts.topSkus} />
        <ZoneChart data={charts.zoneDistribution} />
      </div>
    </div>
  );
}