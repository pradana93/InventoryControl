'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useEntity } from '@/hooks/useEntity';
import { ENTITY_COLORS } from '@/lib/constants';

interface RackOption {
  rack: string;
  qtySistem: number;
  entitas?: string;
}

interface RackAllocation {
  rack: string;
  qty: number;
}

export default function InboundForm() {
  const { entity, badge } = useEntity();

  // Form State
  const [barcode, setBarcode] = useState('');
  const [skuList, setSkuList] = useState<Array<{skuId: string, namaBarang: string, entitas: string}>>([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [palletCode, setPalletCode] = useState('');
  const [nomorSJ, setNomorSJ] = useState('');
  const [tanggalInbound, setTanggalInbound] = useState('');
  const [tanggalExpired, setTanggalExpired] = useState('');
  const [remarks, setRemarks] = useState('');

  // Total quantity calculation & Rack allocations
  const [rackOptions, setRackOptions] = useState<RackOption[]>([]);
  const [allocations, setAllocations] = useState<RackAllocation[]>([
    { rack: '', qty: 0 },
  ]);

  // Loading / Feedback states
  const [loadingSkus, setLoadingSkus] = useState(true);
  const [loadingRacks, setLoadingRacks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load SKU List on mount
  useEffect(() => {
    // Set default tanggal inbound to today
    setTanggalInbound(new Date().toISOString().split('T')[0]);

    async function loadSkus() {
      try {
        const ent = entity === 'ALL' ? '' : entity;
        const res = await fetch(`/api/sku?action=names${ent ? `&ent=${ent}` : ''}`);
        if (res.ok) {
          const data = await res.json();
          setSkuList(data);
          if (Array.isArray(data) && data.length > 0) {
            setSelectedSku(data[0].namaBarang || data[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load SKUs:', err);
      } finally {
        setLoadingSkus(false);
      }
    }
    loadSkus();
  }, [entity]);

  // When SKU changes, load available racks & current stock
  useEffect(() => {
    if (!selectedSku) {
      setRackOptions([]);
      return;
    }

    async function loadRacks() {
      setLoadingRacks(true);
      try {
        const ent = entity === 'ALL' ? '' : entity;
        const res = await fetch(`/api/sku?action=rack-details&skuName=${encodeURIComponent(selectedSku)}${ent ? `&ent=${ent}` : ''}`);
        if (res.ok) {
          const data = await res.json();
          setRackOptions(data);
        }
      } catch (err) {
        console.error('Failed to load racks:', err);
      } finally {
        setLoadingRacks(false);
      }
    }

    loadRacks();
  }, [selectedSku, entity]);

  // Add allocation row (max 6)
  const addAllocationRow = () => {
    if (allocations.length < 6) {
      setAllocations([...allocations, { rack: '', qty: 0 }]);
    }
  };

  // Remove allocation row
  const removeAllocationRow = (index: number) => {
    if (allocations.length > 1) {
      setAllocations(allocations.filter((_, i) => i !== index));
    }
  };

  // Update allocation rack
  const updateAllocationRack = (index: number, rack: string) => {
    const updated = [...allocations];
    updated[index].rack = rack;
    setAllocations(updated);
  };

  // Update allocation qty
  const updateAllocationQty = (index: number, qtyStr: string) => {
    const qty = parseInt(qtyStr, 10) || 0;
    const updated = [...allocations];
    updated[index].qty = Math.max(0, qty);
    setAllocations(updated);
  };

  // Calculate total qty
  const totalQty = allocations.reduce((sum, item) => sum + item.qty, 0);

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedSku) {
      setErrorMessage('Pilih Nama Barang terlebih dahulu.');
      return;
    }

    if (totalQty <= 0) {
      setErrorMessage('Total Qty Inbound harus lebih besar dari 0.');
      return;
    }

    for (const alloc of allocations) {
      if (alloc.qty > 0 && !alloc.rack) {
        setErrorMessage('Pastikan setiap baris dengan jumlah qty memiliki pilihan Rak.');
        return;
      }
    }

    if (entity === 'ALL') {
      setErrorMessage('Pilih entitas spesifik (BBB atau BBT) sebelum submit inbound.');
      return;
    }

    setSubmitting(true);

    const payload: any = {
      entitas: entity,
      barcode: barcode || palletCode,
      namaBarang: selectedSku,
      totalQty,
      tanggalInbound,
      tanggalKadaluarsa: tanggalExpired,
      nomorSJ,
      remarks: remarks + (palletCode ? ` [Pallet: ${palletCode}]` : ''),
    };

    allocations.forEach((alloc, idx) => {
      payload[`rack${idx + 1}`] = alloc.rack;
      payload[`qtyRack${idx + 1}`] = alloc.qty;
    });

    try {
      const res = await fetch('/api/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Gagal menyimpan transaksi inbound.');
      }

      setSuccessMessage('Data inbound berhasil disimpan ke Google Sheets!');
      // Reset form
      setSelectedSku('');
      setPalletCode('');
      setNomorSJ('');
      setTanggalExpired('');
      setRemarks('');
      setAllocations([{ rack: '', qty: 0 }]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  const entityLabel = entity === 'ALL' ? 'Semua Entitas' : entity;
  const entityBadgeColor = ENTITY_COLORS[entity as 'BBB' | 'BBT' | 'ALL'] || ENTITY_COLORS.ALL;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Form Inbound</h1>
            <p className="text-muted-foreground text-sm">Penerimaan & Alokasi Rak Barang Masuk</p>
          </div>
          <span className={`ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${entityBadgeColor.badge}`}>
            Inbound — {entityLabel}
          </span>
        </div>

        {errorMessage && (
          <div className="mb-4 p-4 rounded-md bg-destructive/10 border border-destructive/20 flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm">{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-4 rounded-md bg-green-500/10 border border-green-500/20 flex items-center gap-3 text-green-700">
            <Check className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm">{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informasi Barang</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pallet">Kode Pallet / Meja</Label>
                  <Input
                    id="pallet"
                    placeholder="Contoh: PLT-01"
                    value={palletCode}
                    onChange={(e) => setPalletCode(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="barcode">Barcode (Opsional)</Label>
                  <Input
                    id="barcode"
                    placeholder="Scan atau ketik barcode"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sku">Nama Barang (SKU) *</Label>
                {loadingSkus ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Memuat daftar SKU...
                  </div>
                ) : (
                  <Select defaultValue={selectedSku} onValueChange={setSelectedSku}>
                    <SelectTrigger id="sku">
                      <SelectValue placeholder="Pilih Nama Barang" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem key="" value="" disabled>
                        Pilih Nama Barang
                      </SelectItem>
                      {skuList.map((skuItem) => (
                        <SelectItem key={skuItem.namaBarang} value={skuItem.namaBarang}>
                          {skuItem.namaBarang}
                          {skuItem.entitas && <span className="ml-2 text-xs text-muted-foreground">({skuItem.entitas})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sj">Nomor Surat Jalan (SJ)</Label>
                  <Input
                    id="sj"
                    placeholder="Contoh: SJ-2026/XI/001"
                    value={nomorSJ}
                    onChange={(e) => setNomorSJ(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tgl-inbound">Tanggal Inbound *</Label>
                  <Input
                    id="tgl-inbound"
                    type="date"
                    value={tanggalInbound}
                    onChange={(e) => setTanggalInbound(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tgl-expired">Tanggal Kadaluarsa (Expired)</Label>
                <Input
                  id="tgl-expired"
                  type="date"
                  value={tanggalExpired}
                  onChange={(e) => setTanggalExpired(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Alokasi Rak Section */}
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Alokasi Rak (Maksimal 6)</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Tentukan kuantitas untuk masing-masing rak tujuan
                </p>
              </div>
              <Badge variant="secondary" className="text-sm px-3 py-1 font-semibold">
                Total Inbound: {totalQty}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {allocations.map((alloc, idx) => {
                const currentStock = rackOptions.find((r) => r.rack === alloc.rack)?.qtySistem || 0;

                return (
                  <div
                    key={idx}
                    className="p-3 border rounded-lg bg-card/50 flex flex-col sm:flex-row items-start sm:items-end gap-3"
                  >
                    <div className="flex-1 w-full space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Rak #{idx + 1}</Label>
                        {alloc.rack && (
                          <span className="text-[11px] text-muted-foreground">
                            Stok Saat Ini: <strong className="text-foreground">{currentStock}</strong>
                          </span>
                        )}
                      </div>
                      <Select
                        value={alloc.rack}
                        onValueChange={(val) => updateAllocationRack(idx, val)}
                        disabled={loadingRacks || !selectedSku}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={selectedSku ? 'Pilih Rak' : 'Pilih SKU dahulu'} />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          {rackOptions.map((opt) => (
                            <SelectItem key={opt.rack} value={opt.rack}>
                              {opt.rack} {opt.qtySistem > 0 ? `(Stok: ${opt.qtySistem})` : '(Kosong)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="w-full sm:w-32 space-y-1">
                      <Label className="text-xs font-semibold">Qty</Label>
                      <Input
                        type="number"
                        min="0"
                        value={alloc.qty || ''}
                        onChange={(e) => updateAllocationQty(idx, e.target.value)}
                        placeholder="0"
                      />
                    </div>

                    {allocations.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => removeAllocationRow(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}

              {allocations.length < 6 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={addAllocationRow}
                  disabled={!selectedSku}
                >
                  <Plus className="h-4 w-4 mr-2" /> Tambah Alokasi Rak
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Remarks & Actions */}
          <Card className="mt-6">
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="remarks">Catatan / Remarks</Label>
                <Textarea
                  id="remarks"
                  placeholder="Tambahkan keterangan jika ada..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                />
              </div>

              <Button
                type="submit"
                className="w-full text-base font-semibold py-6"
                disabled={submitting || !selectedSku || totalQty <= 0}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Menyimpan ke Google Sheets...
                  </>
                ) : (
                  `Simpan Inbound (${totalQty} Qty)`
                )}
              </Button>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}