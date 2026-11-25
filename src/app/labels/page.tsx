'use client';

import { useState, useEffect } from 'react';
import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Printer, QrCode, Globe } from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';
import { ENTITY_COLORS } from '@/lib/constants';

interface RackLabel {
  rackId: string;
  skuName: string;
  jenisLokasi: string;
  barcode: string;
  qrUrl: string;
  entitas?: string;
}

function LabelsPageContent() {
  const { entity, badge } = useEntity();
  const [labels, setLabels] = useState<RackLabel[]>([]);
  const [loading, setLoading] = useState(true);

  const entityLabel = entity === 'ALL' ? 'Semua Entitas' : entity;

  useEffect(() => {
    const ent = entity === 'ALL' ? '' : entity;
    async function load() {
      try {
        const res = await fetch(`/api/rack?action=labels${ent ? `&ent=${ent}` : ''}`);
        if (res.ok) setLabels(await res.json());
      } catch (e) {
        console.error('Failed to load labels', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [entity]);

  function handlePrint() {
    window.print();
  }

  function qrImageUrl(rackId: string) {
    const url = `https://inventory-control-five.vercel.app/inbound/scan/${encodeURIComponent(rackId)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(url)}`;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center print:hidden flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <QrCode className="h-6 w-6" /> Rack Labeling
          </h1>
          <p className="text-sm text-muted-foreground">
            Cetak label QR untuk setiap rak. Stock Keeper memindai QR untuk inbound.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handlePrint} disabled={loading}>
            <Printer className="mr-2 h-4 w-4" /> Cetak Semua Label
          </Button>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.badge}`}>
            <Globe className="h-3 w-3 mr-1" /> {entityLabel}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 className="animate-spin h-6 w-6 text-primary" />
          <p className="text-sm text-muted-foreground">Memuat label...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:grid-cols-2 print:gap-2">
          {labels.map((label) => (
            <div
              key={label.rackId}
              className="border-2 border-black rounded-lg p-4 flex items-center gap-4 bg-white text-black break-inside-avoid"
            >
              {/* QR Code */}
              <img
                src={qrImageUrl(label.rackId)}
                alt={`QR ${label.rackId}`}
                width={120}
                height={120}
                className="shrink-0"
              />
              {/* Label Text */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase text-gray-500 font-semibold">Pallet Code</p>
                <p className="text-2xl font-black leading-none mb-2">{label.rackId}</p>
                {label.entitas && (
                  <p className="text-[10px] uppercase text-gray-500 font-semibold mb-1">Entitas</p>
                )}
                <p className="text-[10px] uppercase text-gray-500 font-semibold">SKU Name</p>
                <p className="text-sm font-bold truncate mb-1">{label.skuName}</p>
                <p className="text-[10px] uppercase text-gray-500 font-semibold">Zone / Area</p>
                <p className="text-xs font-semibold">{label.jenisLokasi}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx global>{`
        @media print {
          body { background: white; }
          nav, .print\\:hidden { display: none !important; }
          @page { margin: 10mm; size: A4; }
        }
      `}</style>
    </div>
  );
}

export default function LabelsPage() {
  return (
    <Suspense fallback={<div className="p-6"><div className="container mx-auto"><p className="text-muted-foreground">Memuat label…</p></div></div>}>
      <LabelsPageContent />
    </Suspense>
  );
}