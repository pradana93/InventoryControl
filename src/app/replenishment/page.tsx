'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

const ReplenishmentClient = dynamic(
  () => import('./ReplenishmentClient').then((mod) => mod.ReplenishmentPageContent),
  { ssr: false }
);

export default function ReplenishmentPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <ReplenishmentClient />
    </Suspense>
  );
}