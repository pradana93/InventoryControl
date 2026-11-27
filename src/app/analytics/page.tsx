'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

const AnalyticsClient = dynamic(
  () => import('./AnalyticsClient').then((mod) => mod.AnalyticsPageContent),
  { ssr: false }
);

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AnalyticsClient />
    </Suspense>
  );
}
