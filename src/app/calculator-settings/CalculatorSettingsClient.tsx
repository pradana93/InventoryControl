'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, AlertCircle } from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';

interface CalculatorSetting {
  skuId: string;
  namaBarang: string;
  entitas: 'BBB' | 'BBT';
  leadTimeDays: number;
  safetyStockDays: number;
}

interface CalculatorResult {
  skuName: string;
  currentStock: number;
  ropQty: number;
  saranOrderQty: number;
}

export function CalculatorSettingsPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { entity } = useEntity();

  const [settings, setSettings] = useState<CalculatorSetting[]>([]);
  const [calculatorResults, setCalculatorResults] = useState<Record<string, CalculatorResult>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, calcRes] = await Promise.all([
        fetch('/api/calculator-settings'),
        fetch(`/api/inventory/calculator?ent=${entity === 'ALL' ? 'BBB' : entity}`)
      ]);

      if (!settingsRes.ok || !calcRes.ok) throw new Error('Gagal memuat data');

      const settingsData = await settingsRes.json();
      const calcData: CalculatorResult[] = await calcRes.json();

      setSettings(settingsData);

      const calcMap: Record<string, CalculatorResult> = {};
      calcData.forEach(r => {
        calcMap[r.skuName.toLowerCase()] = r;
      });
      setCalculatorResults(calcMap);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.role !== 'super-admin' && session?.user?.role !== 'manager') {
        router.push('/');
        return;
      }
      fetchData();
    } else if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [session, status, router, fetchData]);

  // Debounced save using useRef for timeout
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<Array<{ skuId: string; leadTimeDays: number; safetyStockDays: number }>>([]);

  const flushUpdates = useCallback(async () => {
    if (pendingUpdatesRef.current.length === 0) return;

    const updatesToSend = [...pendingUpdatesRef.current];
    pendingUpdatesRef.current = [];

    setSaving(true);
    try {
      const res = await fetch('/api/calculator-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatesToSend),
      });
      if (!res.ok) throw new Error('Gagal menyimpan perubahan');
      fetchData(); // Refresh data to get updated state
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  }, [fetchData]);

  const handleUpdate = (skuId: string, field: 'leadTimeDays' | 'safetyStockDays', value: number) => {
    const updatedSettings = settings.map(s =>
      s.skuId === skuId ? { ...s, [field]: value } : s
    );
    setSettings(updatedSettings);

    // Find the updated entry
    const updatedEntry = updatedSettings.find(s => s.skuId === skuId);
    if (!updatedEntry) return;

    // Add to pending updates (replace if same SKU already pending)
    pendingUpdatesRef.current = pendingUpdatesRef.current.filter(u => u.skuId !== skuId);
    pendingUpdatesRef.current.push({
      skuId,
      leadTimeDays: updatedEntry.leadTimeDays,
      safetyStockDays: updatedEntry.safetyStockDays,
    });

    // Reset and start debounce timer
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(flushUpdates, 500);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (status === 'loading' || loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pengaturan Kalkulator</h1>
          <p className="text-muted-foreground mt-1">Konfigurasi Lead Time dan Safety Stock per SKU</p>
        </div>
        {saving && <span className="flex items-center text-sm text-amber-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyimpan...</span>}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <Card className="bg-background border-border">
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">SKU ID</TableHead>
                <TableHead>Nama Barang</TableHead>
                <TableHead className="w-24 text-center">Entitas</TableHead>
                <TableHead className="w-36 text-center">Lead Time (days)</TableHead>
                <TableHead className="w-36 text-center">Safety Stock (days)</TableHead>
                <TableHead className="w-24 text-right">Stok</TableHead>
                <TableHead className="w-24 text-right">ROP</TableHead>
                <TableHead className="w-24 text-right font-bold">Saran Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map((s) => {
                const calc = calculatorResults[s.namaBarang.toLowerCase()];
                return (
                  <TableRow key={s.skuId}>
                    <TableCell className="font-mono text-sm">{s.skuId}</TableCell>
                    <TableCell className="font-medium">{s.namaBarang}</TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${s.entitas === 'BBB' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {s.entitas}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min="1"
                        value={s.leadTimeDays}
                        onChange={(e) => handleUpdate(s.skuId, 'leadTimeDays', parseInt(e.target.value) || 1)}
                        className="w-20 text-center"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min="0"
                        value={s.safetyStockDays}
                        onChange={(e) => handleUpdate(s.skuId, 'safetyStockDays', parseInt(e.target.value) || 0)}
                        className="w-20 text-center"
                      />
                    </TableCell>
                    <TableCell className="text-right">{calc?.currentStock ?? '-'}</TableCell>
                    <TableCell className="text-right">{calc?.ropQty ?? '-'}</TableCell>
                    <TableCell className="text-right font-bold">{calc?.saranOrderQty ?? '-'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}