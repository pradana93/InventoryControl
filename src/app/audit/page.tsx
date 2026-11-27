'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

const AuditClient = dynamic(
  () => import('./AuditClient').then((mod) => mod.AuditPageContent),
  { ssr: false }
);

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AuditClient />
    </Suspense>
  );
}
