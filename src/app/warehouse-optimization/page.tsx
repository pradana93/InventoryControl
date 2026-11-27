'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const MasterSkuClient = dynamic(
  () => import('./master-sku/MasterSkuClient').then((mod) => mod.MasterSkuPageContent),
  { ssr: false, loading: () => <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin" /></div> }
);

const SlottingClient = dynamic(
  () => import('./slotting/SlottingClient').then((mod) => mod.SlottingPageContent),
  { ssr: false, loading: () => <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin" /></div> }
);

export default function WarehouseOptimizationPage() {
  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <h1 className="text-3xl font-bold mb-6">Optimalisasi Gudang</h1>
      <Tabs defaultValue="master-sku">
        <TabsList>
          <TabsTrigger value="master-sku">Master Data SKU</TabsTrigger>
          <TabsTrigger value="slotting-optimizer">Optimasi Slotting</TabsTrigger>
        </TabsList>
        <TabsContent value="master-sku">
          <Suspense fallback={<Loader2 className="animate-spin" />}><MasterSkuClient /></Suspense>
        </TabsContent>
        <TabsContent value="slotting-optimizer">
          <Suspense fallback={<Loader2 className="animate-spin" />}><SlottingClient /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
