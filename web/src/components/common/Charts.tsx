'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { cn } from '@/lib/utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement
);

interface TopSKUChartProps {
  data: { namaBarang: string; qty: number }[];
}

export function TopSKUChart({ data }: TopSKUChartProps) {
  if (!data.length) return null;

  const chartData = {
    labels: data.map((d) => d.namaBarang.length > 20 ? d.namaBarang.substring(0, 20) + '…' : d.namaBarang),
    datasets: [
      {
        label: 'Qty',
        data: data.map((d) => d.qty),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Top 10 SKU by Qty Sistem</CardTitle>
      </CardHeader>
      <CardContent className="h-64 sm:h-72">
        <Bar
          data={chartData}
          options={{
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => `Qty: ${ctx.raw}`,
                },
              },
            },
            scales: {
              x: { beginAtZero: true, grid: { display: false } },
              y: { grid: { display: false } },
            },
          }}
        />
      </CardContent>
    </Card>
  );
}

interface ZoneChartProps {
  data: { zone: string; qty: number }[];
}

export function ZoneChart({ data }: ZoneChartProps) {
  if (!data.length) return null;

  const colors = [
    'rgba(59, 130, 246, 0.8)',
    'rgba(16, 185, 129, 0.8)',
    'rgba(249, 115, 22, 0.8)',
    'rgba(236, 72, 153, 0.8)',
    'rgba(139, 92, 246, 0.8)',
    'rgba(234, 179, 8, 0.8)',
    'rgba(20, 184, 166, 0.8)',
    'rgba(244, 63, 94, 0.8)',
  ];

  const chartData = {
    labels: data.map((d) => `Zona ${d.zone}`),
    datasets: [
      {
        data: data.map((d) => d.qty),
        backgroundColor: data.map((_, i) => colors[i % colors.length]),
        borderColor: data.map((_, i) => colors[i % colors.length].replace('0.8', '1')),
        borderWidth: 1,
      },
    ],
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Distribusi Zona</CardTitle>
      </CardHeader>
      <CardContent className="h-64 sm:h-72">
        <Doughnut
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right', labels: { font: { size: 11 } } },
              tooltip: {
                callbacks: {
                  label: (ctx) => `Zona ${ctx.label}: ${ctx.raw} qty`,
                },
              },
            },
            cutout: '60%',
          }}
        />
      </CardContent>
    </Card>
  );
}