'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import {
  Loader2,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Search,
  CheckCircle2,
  PackageSearch,
  Download,
} from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';
import { filterActiveSkus } from '@/lib/warehouse-optimization';

// ============================================================================
// TYPES
// ============================================================================

export interface MasterSkuItem {
  skuId: string;
  namaBarang: string;
  entitas: 'BBB' | 'BBT';
  satuan: string;
  kategori: string;
  barcode: string;
  unitCost: number;
  leadTimeDays: number;
  safetyStockDays: number;
  activeFlag: boolean;
  currentStock: number;
  inventoryValue: number;
}

/** Blank draft used by the create form. */
export function emptySkuDraft(entitas: 'BBB' | 'BBT'): SkuFormDraft {
  return {
    skuId: '',
    namaBarang: '',
    satuan: 'Pcs',
    kategori: 'General',
    entitas,
    barcode: '',
    unitCost: 0,
    leadTimeDays: 3,
    safetyStockDays: 3,
    activeFlag: true,
  };
}

export interface SkuFormDraft {
  skuId: string;
  namaBarang: string;
  satuan: string;
  kategori: string;
  entitas: 'BBB' | 'BBT';
  barcode: string;
  unitCost: number;
  leadTimeDays: number;
  safetyStockDays: number;
  activeFlag: boolean;
}

/**
 * Client-side filter for the master SKU table. Pure, exported for testing.
 */
export function filterMasterSkus(
  items: MasterSkuItem[],
  filters: { search?: string; status?: 'ALL' | 'AKTIF' | 'NONAKTIF' }
): MasterSkuItem[] {
  const search = filters.search?.trim().toLowerCase();
  const status = filters.status || 'ALL';
  return items.filter((item) => {
    if (status === 'AKTIF' && !item.activeFlag) return false;
    if (status === 'NONAKTIF' && item.activeFlag) return false;
    if (search) {
      const hay = `${item.skuId} ${item.namaBarang} ${item.kategori} ${item.barcode}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

/**
 * Validate a SKU draft. Returns an error message in Bahasa Indonesia, or null
 * when the draft is valid. Pure, exported for testing.
 */
export function validateSkuDraft(draft: SkuFormDraft): string | null {
  if (!draft.skuId.trim()) return 'SKU ID wajib diisi';
  if (!draft.namaBarang.trim()) return 'Nama Barang wajib diisi';
  if (!draft.satuan.trim()) return 'Satuan wajib diisi';
  if (draft.unitCost < 0) return 'Harga satuan tidak boleh negatif';
  if (draft.leadTimeDays < 0) return 'Lead time tidak boleh negatif';
  if (draft.safetyStockDays < 0) return 'Safety stock tidak boleh negatif';
  return null;
}

// ============================================================================
// FORMAT
// ============================================================================

const formatCurrency = (num: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num || 0);

const formatNumber = (num: number) => Number(num || 0).toLocaleString('id-ID');

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MasterSkuPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { entity } = useEntity();

  const [items, setItems] = useState<MasterSkuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AKTIF' | 'NONAKTIF'>('ALL');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSkuId, setEditingSkuId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SkuFormDraft>(emptySkuDraft('BBB'));
  const [deleteTarget, setDeleteTarget] = useState<MasterSkuItem | null>(null);

  const userRole = (session?.user as any)?.role as string | undefined;
  const canEdit = userRole === 'super-admin' || userRole === 'manager';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entParam = entity === 'ALL' ? '' : `?ent=${entity}`;
      const [catalogRes, stockRes] = await Promise.all([
        fetch(`/api/catalog${entParam}`),
        fetch(`/api/inventory/calculator${entParam}`),
      ]);
      if (!catalogRes.ok || !stockRes.ok) throw new Error('Gagal memuat data master SKU');
      const catalogData = await catalogRes.json();
      const stockData: any[] = stockRes.ok ? await stockRes.json() : [];

      const mapped: MasterSkuItem[] = catalogData.map((entry: any) => {
        const stock = stockData.find(
          (s: any) => s.skuName === entry.namaBarang && s.entitas === entry.entitas
        );
        return {
          skuId: entry.skuId,
          namaBarang: entry.namaBarang,
          entitas: entry.entitas,
          satuan: entry.satuan || 'Pcs',
          kategori: entry.kategori || 'General',
          barcode: entry.barcode || '',
          unitCost: entry.unitCost || 0,
          leadTimeDays: entry.leadTimeDays ?? 3,
          safetyStockDays: entry.safetyStockDays ?? 3,
          activeFlag: entry.activeFlag ?? true,
          currentStock: stock?.currentStock ?? 0,
          inventoryValue: stock?.inventoryValue ?? 0,
        };
      });
      setItems(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    if (status === 'authenticated') loadData();
    else if (status === 'unauthenticated') router.push('/login');
  }, [status, loadData, router]);

  const filtered = useMemo(
    () => filterMasterSkus(items, { search, status: statusFilter }),
    [items, search, statusFilter]
  );

  const summary = useMemo(() => {
    const active = items.filter((i) => i.activeFlag).length;
    const totalValue = items.reduce((s, i) => s + i.inventoryValue, 0);
    const zeroCost = items.filter((i) => i.unitCost === 0).length;
    return { total: items.length, active, inactive: items.length - active, totalValue, zeroCost };
  }, [items]);

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  const openCreate = () => {
    setEditingSkuId(null);
    setDraft(emptySkuDraft(entity === 'BBT' ? 'BBT' : 'BBB'));
    setDialogOpen(true);
  };

  const openEdit = (item: MasterSkuItem) => {
    setEditingSkuId(item.skuId);
    setDraft({
      skuId: item.skuId,
      namaBarang: item.namaBarang,
      satuan: item.satuan,
      kategori: item.kategori,
      entitas: item.entitas,
      barcode: item.barcode,
      unitCost: item.unitCost,
      leadTimeDays: item.leadTimeDays,
      safetyStockDays: item.safetyStockDays,
      activeFlag: item.activeFlag,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const validationError = validateSkuDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isEdit = editingSkuId !== null;
      const res = await fetch('/api/catalog', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan SKU');
      setDialogOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan SKU');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: MasterSkuItem) => {
    try {
      const res = await fetch('/api/catalog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuId: item.skuId, activeFlag: !item.activeFlag }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Gagal mengubah status');
      }
      setItems((prev) =>
        prev.map((s) => (s.skuId === item.skuId ? { ...s, activeFlag: !s.activeFlag } : s))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/catalog?skuId=${encodeURIComponent(deleteTarget.skuId)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menghapus SKU');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus SKU');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const header = [
      'SKU ID',
      'Nama Barang',
      'Entitas',
      'Satuan',
      'Kategori',
      'Barcode',
      'Harga Satuan (Rp)',
      'Lead Time (hari)',
      'Safety Stock (hari)',
      'Status',
      'Stok',
      'Nilai (Rp)',
    ];
    const aoa: (string | number)[][] = [
      ['MASTER DATA SKU — OPTIMALISASI GUDANG'],
      ['Entitas:', entity, '', 'Diekspor:', new Date().toLocaleString('id-ID')],
      [],
      header,
      ...filtered.map((i) => [
        i.skuId,
        i.namaBarang,
        i.entitas,
        i.satuan,
        i.kategori,
        i.barcode,
        Math.round(i.unitCost),
        i.leadTimeDays,
        i.safetyStockDays,
        i.activeFlag ? 'Aktif' : 'Nonaktif',
        i.currentStock,
        Math.round(i.inventoryValue),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Master SKU');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Master-SKU-${entity}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Master Data SKU</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola katalog SKU: tambah, ubah, hapus, dan atur biaya, lead time, serta safety stock per entitas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export Excel
          </Button>
          {canEdit && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Tambah SKU
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline">
            Tutup
          </button>
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total SKU</p>
            <p className="text-2xl font-bold">{formatNumber(summary.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Aktif</p>
            <p className="text-2xl font-bold text-emerald-400">{formatNumber(summary.active)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Nonaktif</p>
            <p className="text-2xl font-bold text-muted-foreground">{formatNumber(summary.inactive)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Tanpa Harga Satuan</p>
            <p className={`text-2xl font-bold ${summary.zeroCost > 0 ? 'text-amber-400' : ''}`}>
              {formatNumber(summary.zeroCost)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* TABLE */}
      <Card className="bg-background border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Daftar SKU</CardTitle>
          <CardDescription>
            {filtered.length} dari {items.length} SKU ditampilkan
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari SKU ID, nama barang, kategori, atau barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="AKTIF">Aktif</SelectItem>
                <SelectItem value="NONAKTIF">Nonaktif</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="Tidak ada SKU"
              description="Belum ada SKU yang cocok dengan filter ini. Tambahkan SKU baru atau ubah filter pencarian."
              icon={PackageSearch}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">SKU ID</TableHead>
                    <TableHead>Nama Barang</TableHead>
                    <TableHead className="w-16">Entitas</TableHead>
                    <TableHead className="w-20">Satuan</TableHead>
                    <TableHead className="w-32">Kategori</TableHead>
                    <TableHead className="w-28 text-right">Harga Satuan</TableHead>
                    <TableHead className="w-20 text-right">Lead</TableHead>
                    <TableHead className="w-20 text-right">Safety</TableHead>
                    <TableHead className="w-20 text-right">Stok</TableHead>
                    <TableHead className="w-24 text-center">Status</TableHead>
                    {canEdit && <TableHead className="w-28 text-center">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.skuId}>
                      <TableCell className="font-mono text-xs">{item.skuId}</TableCell>
                      <TableCell className="font-medium max-w-[18rem]">
                        <div className="truncate" title={item.namaBarang}>
                          {item.namaBarang}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            item.entitas === 'BBB'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                          }
                        >
                          {item.entitas}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{item.satuan}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[8rem]" title={item.kategori}>
                        {item.kategori}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${item.unitCost === 0 ? 'text-amber-400' : ''}`}
                      >
                        {item.unitCost === 0 ? 'Belum diisi' : formatCurrency(item.unitCost)}
                      </TableCell>
                      <TableCell className="text-right text-sm">{item.leadTimeDays} hr</TableCell>
                      <TableCell className="text-right text-sm">{item.safetyStockDays} hr</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatNumber(item.currentStock)}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={
                            item.activeFlag
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                          }
                        >
                          {item.activeFlag ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openEdit(item)}
                              title="Ubah SKU"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleToggleActive(item)}
                              title={item.activeFlag ? 'Nonaktifkan' : 'Aktifkan'}
                            >
                              <CheckCircle2
                                className={`h-4 w-4 ${item.activeFlag ? 'text-emerald-400' : 'text-muted-foreground'}`}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(item)}
                              title="Hapus SKU"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSkuId ? 'Ubah SKU' : 'Tambah SKU Baru'}</DialogTitle>
            <DialogDescription>
              {editingSkuId
                ? 'Perbarui informasi SKU. Perubahan langsung tersimpan ke katalog.'
                : 'Lengkapi data SKU baru. SKU ID harus unik dan tidak boleh sama dengan yang sudah ada.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="f-skuId">SKU ID <span className="text-destructive">*</span></Label>
                <Input
                  id="f-skuId"
                  value={draft.skuId}
                  onChange={(e) => setDraft({ ...draft, skuId: e.target.value })}
                  placeholder="BBB-001"
                  disabled={saving || editingSkuId !== null}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-entitas">Entitas <span className="text-destructive">*</span></Label>
                <Select
                  value={draft.entitas}
                  onValueChange={(v) => setDraft({ ...draft, entitas: v as 'BBB' | 'BBT' })}
                  disabled={saving || editingSkuId !== null}
                >
                  <SelectTrigger id="f-entitas">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BBB">BBB</SelectItem>
                    <SelectItem value="BBT">BBT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-nama">Nama Barang <span className="text-destructive">*</span></Label>
              <Input
                id="f-nama"
                value={draft.namaBarang}
                onChange={(e) => setDraft({ ...draft, namaBarang: e.target.value })}
                placeholder="Contoh: Chicken Nugget"
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="f-satuan">Satuan <span className="text-destructive">*</span></Label>
                <Input
                  id="f-satuan"
                  value={draft.satuan}
                  onChange={(e) => setDraft({ ...draft, satuan: e.target.value })}
                  placeholder="Pcs / Box / Kg"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-kategori">Kategori</Label>
                <Input
                  id="f-kategori"
                  value={draft.kategori}
                  onChange={(e) => setDraft({ ...draft, kategori: e.target.value })}
                  placeholder="General"
                  disabled={saving}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-barcode">Barcode</Label>
              <Input
                id="f-barcode"
                value={draft.barcode}
                onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
                placeholder="Opsional"
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="f-cost">Harga Satuan</Label>
                <Input
                  id="f-cost"
                  type="number"
                  min={0}
                  value={draft.unitCost}
                  onChange={(e) => setDraft({ ...draft, unitCost: Number(e.target.value) })}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-lead">Lead Time (hr)</Label>
                <Input
                  id="f-lead"
                  type="number"
                  min={0}
                  value={draft.leadTimeDays}
                  onChange={(e) => setDraft({ ...draft, leadTimeDays: Number(e.target.value) })}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-safety">Safety Stock (hr)</Label>
                <Input
                  id="f-safety"
                  type="number"
                  min={0}
                  value={draft.safetyStockDays}
                  onChange={(e) => setDraft({ ...draft, safetyStockDays: Number(e.target.value) })}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingSkuId ? 'Simpan Perubahan' : 'Tambah SKU'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRM DIALOG */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Hapus SKU?</DialogTitle>
            <DialogDescription>
              Anda akan menghapus <strong>{deleteTarget?.namaBarang}</strong> ({deleteTarget?.skuId}) dari
              master data. Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Hapus SKU
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
