'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

const ReportsClient = dynamic(
  () => import('./ReportsClient').then((mod) => mod.ReportsPageContent),
  { ssr: false }
);

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ReportsClient />
    </Suspense>
  );
}
