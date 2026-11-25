'use client';

import { Suspense } from 'react';
import InboundForm from './InboundForm';

function InboundPageContent() {
  return <InboundForm />;
}

export default function InboundPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background px-4 py-6"><div className="container mx-auto"><p className="text-muted-foreground">Memuat form inbound…</p></div></div>}>
      <InboundPageContent />
    </Suspense>
  );
}