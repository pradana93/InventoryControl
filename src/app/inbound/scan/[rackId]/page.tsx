'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Package, Plus, X } from 'lucide-react';

export default function RackScanPage() {
  const params = useParams();
  const rackId = params?.rackId as string;
  const [rack, setRack] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [qtyIn, setQtyIn] = useState('');
  const [tanggalExpired, setTanggalExpired] = useState('');
  const [nomorSJ, setNomorSJ] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/rack/scan/${encodeURIComponent(rackId)}`);
        if (res.ok) {
          const data = await res.json();
          setRack(data);
          // Default expiry to ~30 days from now
          const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          setTanggalExpired(defaultExpiry.toISOString().slice(0, 10));
        } else {
          setRack(null);
        }
      } catch (e) {
        console.error('Failed to load rack', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [rackId]);

  async function handleSubmit() {
    if (!rack) return;
    if (!qtyIn || parseInt(qtyIn) <= 0) {
      alert('Jumlah masuk harus lebih dari 0');
      return;
    }
    if (!tanggalExpired) {
      alert('Tanggal expired wajib diisi');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/inbound/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: `SCAN-${rackId}`,
          namaBarang: rack.currentSku,
          totalQty: parseInt(qtyIn),
          tanggalInbound: new Date().toISOString().slice(0, 10),
          tanggalKadaluarsa: tanggalExpired,
          nomorSJ: nomorSJ || `SJ-${Date.now()}`,
          rack1: rackId,
          qtyRack1: parseInt(qtyIn),
          remarks: `Scan inbound via ${rackId}`,
        }),
      });
      if (res.ok) {
        setShowModal(false);
        setQtyIn('');
        setNomorSJ('');
        alert('✅ Inbound berhasil disimpan ke Ledger!');
      } else {
        const err = await res.json();
        alert(`❌ Error: ${err.error || 'Gagal menyimpan'}`);
      }
    } catch (e) {
      alert('❌ Error jaringan: ' + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Memuat data rak...</p>
        </div>
      </div>
    );
  }

  if (!rack) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-destructive">
          <CardContent className="p-6 text-center">
            <Package className="h-12 w-12 text-destructive mx-auto mb-3" />
            <h2 className="font-semibold text-destructive">Rak Tidak Ditemukan</h2>
            <p className="text-sm text-muted-foreground mt-1">Rak "{rackId}" tidak ada dalam database.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="text-center pt-8">
          <Package className="h-10 w-10 text-primary mx-auto mb-2" />
          <h1 className="text-xl font-bold">INBOUND STOCK</h1>
          <p className="text-sm text-muted-foreground">Masukkan barang baru ke rak</p>
        </div>

        {/* Rack Info Card (READ-ONLY) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Rak: {rack.rackId}</span>
              <span className="text-[10px] font-normal text-muted-foreground bg-muted px-2 py-1 rounded-full uppercase">
                {rack.jenisLokasi}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">SKU</span>
              <span className="font-semibold">{rack.currentSku}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stok Sistem</span>
              <span className="font-bold text-lg">{rack.currentQty}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tanggal Expired</span>
              <span className="font-semibold">{rack.expiredLabel}</span>
            </div>
            {rack.skuBarcode && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Barcode SKU</span>
                <span className="font-mono text-xs">{rack.skuBarcode}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Read-only notice */}
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <span>ℹ️</span>
          <span>Data di atas tidak dapat diubah. Cek stok fisik sebelum inbound.</span>
        </div>

        {/* Add Stock Button */}
        <Button
          className="w-full h-14 text-lg font-semibold"
          onClick={() => setShowModal(true)}
        >
          <Plus className="mr-2 h-5 w-5" />
          TAMBAH STOK INBOUND
        </Button>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => window.location.href = '/'}
        >
          ← Kembali ke Dashboard
        </Button>
      </div>

      {/* Inbound Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background w-full max-w-sm rounded-xl border shadow-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">TAMBAH INBOUND — {rackId}</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Jumlah Masuk (Qty)</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="0"
                  value={qtyIn}
                  onChange={(e) => setQtyIn(e.target.value)}
                  className="text-lg font-semibold"
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Tanggal Expired</Label>
                <Input
                  type="date"
                  value={tanggalExpired}
                  onChange={(e) => setTanggalExpired(e.target.value)}
                  className="text-sm"
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Nomor SJ (Surat Jalan)</Label>
                <Input
                  placeholder="SJ-XXXXX"
                  value={nomorSJ}
                  onChange={(e) => setNomorSJ(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>
                Batal
              </Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="mr-2 h-4 w-4" />}
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
