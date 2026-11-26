'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

// ==========================================
// 1. FEFO Timeline Chart
// ==========================================
interface FefoItem {
  namaBarang: string;
  nomorRak: string;
  qtySistem: number;
  daysToExpiry: number;
  expiredLabel: string;
}

export function FefoTimelineChart({ data }: { data: FefoItem[] }) {
  // Sort by urgency: expired first, then expiring soon, then safe
  const chartData = [...(data ?? [])]
    .filter((item) => item && typeof item.qtySistem === 'number')
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry)
    .slice(0, 15)
    .map((item) => ({
      name: `${String(item.namaBarang ?? '-').slice(0, 14)}.. (${item.nomorRak})`,
      qty: item.qtySistem,
      days: item.daysToExpiry,
      expiredLabel: item.expiredLabel,
      color:
        item.daysToExpiry <= 0
          ? '#ef4444' // Red: Expired
          : item.daysToExpiry <= 30
          ? '#f59e0b' // Amber: Expiring Soon
          : '#10b981', // Green: Safe
    }));

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span>Prioritas FEFO (Kadaluarsa Terdekat)</span>
          <span className="text-xs text-muted-foreground font-normal">Top 15 Lot</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border border-border p-2 rounded shadow text-xs">
                      <p className="font-semibold">{d.name}</p>
                      <p>Qty: {d.qty.toLocaleString()}</p>
                      <p>Expired: {d.expiredLabel}</p>
                      <p className="font-medium text-muted-foreground">
                        {d.days <= 0 ? 'Sudah Expired' : `${d.days} hari tersisa`}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ==========================================
// 2. Accuracy Radial Gauge
// ==========================================
export function AccuracyGaugeChart({ accuracy }: { accuracy: number }) {
  const safeAccuracy = Math.min(100, Math.max(0, accuracy));
  const data = [
    { name: 'Akurasi', value: safeAccuracy, fill: safeAccuracy >= 95 ? '#10b981' : safeAccuracy >= 85 ? '#f59e0b' : '#ef4444' },
    { name: 'Inakurasi', value: 100 - safeAccuracy, fill: 'var(--muted)' },
  ];

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Tingkat Akurasi Stok</CardTitle>
      </CardHeader>
      <CardContent className="h-64 sm:h-72 flex flex-col items-center justify-center relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              startAngle={180}
              endAngle={0}
              innerRadius={65}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute text-center mt-6">
          <span className="text-3xl font-extrabold tracking-tight tabular-nums">
            {accuracy.toFixed(1)}%
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {accuracy >= 98 ? 'Sangat Baik' : accuracy >= 95 ? 'Baik' : 'Perlu Opname'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ==========================================
// 3. Variance Waterfall / Breakdown
// ==========================================
export function VarianceBreakdownChart({
  systemQty,
  soh,
  variance,
}: {
  systemQty: number;
  soh: number;
  variance: number;
}) {
  const chartData = [
    { name: 'Kuantitas Sistem', qty: systemQty, fill: '#3b82f6' },
    { name: 'Stok Fisik (SOH)', qty: soh, fill: '#10b981' },
    {
      name: 'Variance',
      qty: Math.abs(variance),
      fill: variance === 0 ? '#6b7280' : variance > 0 ? '#10b981' : '#ef4444',
    },
  ];

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Komparasi Sistem vs Fisik</CardTitle>
      </CardHeader>
      <CardContent className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(val: any) => [Number(val).toLocaleString() + ' Pcs', 'Jumlah']}
            />
            <Bar dataKey="qty" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}