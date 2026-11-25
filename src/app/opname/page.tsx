'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function StockOpnamePage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);


  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/stock-opname?action=list');
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error('Failed to load', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleSave(rackId: string, skuName: string, soh: number) {
    setSaving({ ...saving, [`${rackId}-${skuName}`]: true });
    setMessage(null);
    try {
      const res = await fetch('/api/stock-opname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rackId, skuName, qtyFisikSOH: soh, petugas: 'User', catatan: 'Opname' }),
      });
      if (res.ok) {
        setMessage(`Rak ${rackId} (${skuName}) berhasil disimpan.`);
        loadData();
      } else {
        alert('Gagal menyimpan');
      }
    } catch (e) {
      alert('Gagal menyimpan stok fisik');
    } finally {
      setSaving({ ...saving, [`${rackId}-${skuName}`]: false });
    }
  }

  async function handleSync() {
    setLoading(true);
    try {
      await fetch('/api/stock-opname?action=sync');
      setMessage('Sinkronisasi berhasil.');
      loadData();
    } catch (e) {
      alert('Gagal sinkronisasi');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Opname (Cycle Count)</h1>
          <p className="text-sm text-muted-foreground">Input stok fisik (SOH) per rack/pallet untuk perbandingan sistem vs fisik.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSync} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Sinkron Sistem
          </Button>
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Daftar Rak & Kuantitas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="animate-spin h-6 w-6 text-primary" />
              <p className="text-sm text-muted-foreground">Memuat data Stock Opname...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rak</TableHead>
                  <TableHead>Nama Barang</TableHead>
                  <TableHead>Qty Sistem</TableHead>
                  <TableHead>Qty Fisik (SOH)</TableHead>
                  <TableHead>Variance</TableHead>
                  <TableHead>Akurasi</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={`${row.rackId}-${row.skuName}`}>
                    <TableCell className="font-medium">{row.rackId}</TableCell>
                    <TableCell>{row.skuName}</TableCell>
                    <TableCell>{row.qtySistem.toLocaleString()}</TableCell>
                    <TableCell>
                      <Input 
                        type="number" 
                        defaultValue={row.qtyFisikSOH} 
                        className="w-28"
                        onBlur={(e) => handleSave(row.rackId, row.skuName, parseFloat(e.target.value))}
                      />
                    </TableCell>
                    <TableCell className={row.variance !== 0 ? 'text-destructive font-bold' : 'text-emerald-600 font-medium'}>
                      {row.variance > 0 ? `+${row.variance}` : row.variance}
                    </TableCell>
                    <TableCell className="font-semibold">{row.akurasi}</TableCell>
                    <TableCell className="text-right">
                      {saving[`${row.rackId}-${row.skuName}`] ? (
                        <Loader2 className="animate-spin h-4 w-4 inline text-primary" />
                      ) : (
                        <Save className="h-4 w-4 inline text-muted-foreground hover:text-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}