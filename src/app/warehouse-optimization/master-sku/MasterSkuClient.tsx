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
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
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

/** A parsed row from an import file, with client-side validation status. */
export interface ImportPreviewRow {
  row: number;
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
  valid: boolean;
  error?: string;
}

/**
 * Column headers shared by the Export, Template, and Import files. Keeping a
 * single source of truth means an exported file can be re-imported unchanged.
 */
export const SKU_EXPORT_HEADERS = [
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
] as const;

/**
 * Parse a sheet (array of arrays) into import preview rows, validating each.
 * Pure and exported for testing. Row indexes are 1-based including the header.
 */
export function parseSkuImportRows(data: unknown[][]): {
  rows: ImportPreviewRow[];
  error?: string;
} {
  if (data.length < 2) {
    return { rows: [], error: 'File kosong atau hanya berisi header' };
  }

  const headers = (data[0] as unknown[]).map((c) => String(c ?? '').trim());
  const col = (name: string) => headers.findIndex((h) => h === name);
  const idxSku = col('SKU ID');
  const idxNama = col('Nama Barang');

  if (idxSku < 0 || idxNama < 0) {
    return { rows: [], error: 'Header tidak valid. Kolom "SKU ID" dan "Nama Barang" wajib ada.' };
  }

  const pick = (row: unknown[], name: string): string => {
    const i = col(name);
    return i >= 0 ? String(row[i] ?? '').trim() : '';
  };

  const rows: ImportPreviewRow[] = [];
  for (let i = 1; i < data.length; i++) {
    const raw = data[i] as unknown[];
    const skuId = pick(raw, 'SKU ID');
    if (!skuId) continue;

    const ent = pick(raw, 'Entitas').toUpperCase();
    const statusStr = pick(raw, 'Status').toLowerCase();
    const row: ImportPreviewRow = {
      row: i + 1,
      skuId,
      namaBarang: pick(raw, 'Nama Barang'),
      entitas: ent === 'BBT' ? 'BBT' : 'BBB',
      satuan: pick(raw, 'Satuan') || 'Pcs',
      kategori: pick(raw, 'Kategori') || 'General',
      barcode: pick(raw, 'Barcode'),
      unitCost: Number(pick(raw, 'Harga Satuan (Rp)').replace(/[^\d.-]/g, '')) || 0,
      leadTimeDays: Math.max(0, Number(pick(raw, 'Lead Time (hari)')) || 3),
      safetyStockDays: Math.max(0, Number(pick(raw, 'Safety Stock (hari)')) || 3),
      activeFlag:
        statusStr !== 'nonaktif' &&
        statusStr !== 'inactive' &&
        statusStr !== 'false' &&
        statusStr !== '0',
      valid: true,
    };

    const problems: string[] = [];
    if (!row.namaBarang) problems.push('Nama Barang kosong');
    if (row.unitCost < 0) problems.push('Harga satuan negatif');
    if (problems.length > 0) {
      row.valid = false;
      row.error = problems.join('; ');
    }
    rows.push(row);
  }

  return { rows };
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

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
    const header = [...SKU_EXPORT_HEADERS];
    const aoa: (string | number)[][] = [
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

  const downloadBlob = (buf: ArrayBuffer, filename: string) => {
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const header = [...SKU_EXPORT_HEADERS];
    const sample: (string | number)[][] = [
      header,
      ['BBB-001', 'Contoh Produk 1', 'BBB', 'Pcs', 'Makanan', '', 25000, 3, 5, 'Aktif', '', ''],
      ['BBT-001', 'Contoh Produk 2', 'BBT', 'Box', 'Minuman', '', 150000, 5, 7, 'Aktif', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    ws['!cols'] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    downloadBlob(buf, `Template-Import-Master-SKU-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const resetImport = () => {
    setImportFile(null);
    setImportPreview(null);
    const fileInput = document.getElementById('import-file-input') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('Format file tidak didukung. Gunakan .xlsx atau .xls');
      return;
    }

    setImportFile(file);
    setError(null);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];

      const { rows, error: parseError } = parseSkuImportRows(jsonData);
      if (parseError) {
        setError(parseError);
        setImportPreview(null);
        return;
      }
      setImportPreview(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca file Excel');
      setImportPreview(null);
    }
  };

  const handleImportConfirm = async () => {
    if (!importFile) return;
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('entity', entity);

      const res = await fetch('/api/catalog/import', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal mengimpor data');

      setImportDialogOpen(false);
      resetImport();
      await loadData();
      setNotice(
        `Import berhasil: ${json.created} dibuat, ${json.updated} diperbarui` +
          (json.errors?.length ? `, ${json.errors.length} gagal` : '')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengimpor data');
    } finally {
      setImporting(false);
    }
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
            <>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Template
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setImportDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" /> Import Excel
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" /> Tambah SKU
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline">Tutup</button>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 p-4 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs underline">Tutup</button>
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

      {/* IMPORT EXCEL DIALOG */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Import Master SKU dari Excel</DialogTitle>
            <DialogDescription>
              Unggah file Excel (.xlsx/.xls). Data akan di-upsert (SKU baru dibuat, SKU existing diperbarui).
              Unduh "Template" terlebih dahulu untuk melihat format standar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col h-[60vh] p-4 space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <input
                id="import-file-input"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportFileChange}
                className="hidden"
                disabled={importing}
              />
              <label htmlFor="import-file-input" className="cursor-pointer flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
                <div>
                  <p className="font-medium">Klik atau tarik file Excel ke sini</p>
                  <p className="text-sm text-muted-foreground">Format: .xlsx atau .xls (maks 10MB)</p>
                </div>
              </label>
              {importFile && (
                <p className="text-sm text-emerald-400 mt-2">
                  File dipilih: <strong>{importFile.name}</strong>
                </p>
              )}
            </div>

            {/* Preview Table */}
            {importPreview !== null && (
              <div className="flex-1 overflow-auto border border-border rounded-lg">
                <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-3 flex items-center justify-between">
                  <p className="font-medium">Pratinjau ({importPreview.length} baris)</p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>SKU ID</TableHead>
                      <TableHead>Barang</TableHead>
                      <TableHead>Valid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.map((item) => (
                      <TableRow key={item.row} className={!item.valid ? 'bg-destructive/5' : ''}>
                        <TableCell>{item.row}</TableCell>
                        <TableCell className="font-mono">{item.skuId}</TableCell>
                        <TableCell>{item.namaBarang}</TableCell>
                        <TableCell>
                          {item.valid ? (
                            <CheckCircle className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <span className="text-destructive">
                              <AlertTriangle className="h-4 w-4" />
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)} disabled={importing}>
              Batal
            </Button>
            <Button
              onClick={handleImportConfirm}
              disabled={importing || !importPreview || importPreview.some((r) => !r.valid)}
            >
              {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
