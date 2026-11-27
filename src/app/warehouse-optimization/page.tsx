'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SkuLifecycleClient = dynamic(
  () => import('./sku-lifecycle/SkuLifecycleClient').then((mod) => mod.SkuLifecyclePageContent),
  { ssr: false, loading: () => <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin" /></div> }
);

const SlottingClient = dynamic(
  () => import('./slotting/SlottingClient').then((mod) => mod.SlottingPageContent),
  { ssr: false, loading: () => <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin" /></div> }
);

export default function WarehouseOptimizationPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Optimalisasi Gudang</h1>
      <Tabs defaultValue="sku-lifecycle">
        <TabsList>
          <TabsTrigger value="sku-lifecycle">Manajemen Siklus SKU</TabsTrigger>
          <TabsTrigger value="slotting-optimizer">Optimasi Slotting</TabsTrigger>
        </TabsList>
        <TabsContent value="sku-lifecycle">
          <Suspense fallback={<Loader2 className="animate-spin" />}><SkuLifecycleClient /></Suspense>
        </TabsContent>
        <TabsContent value="slotting-optimizer">
          <Suspense fallback={<Loader2 className="animate-spin" />}><SlottingClient /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
