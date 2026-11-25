'use client';

import { Suspense } from 'react';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { useEntity } from '@/hooks/useEntity';

function DashboardPageContent() {
  const { entity, badge } = useEntity();

  // Entity badge for display
  const entityLabel = entity === 'ALL' ? 'Semua Entitas' : entity;

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="container mx-auto">
        <div className="mb-6 flex flex-col gap-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">Inventory Dashboard</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.badge}`}>
              {entityLabel}
            </span>
          </div>
          <p className="text-muted-foreground text-base">Pantau stok gudang secara real-time</p>
        </div>
        <DashboardView initialEntity={entity} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background px-4 py-6"><div className="container mx-auto"><p className="text-muted-foreground">Memuat dashboard…</p></div></div>}>
      <DashboardPageContent />
    </Suspense>
  );
}
