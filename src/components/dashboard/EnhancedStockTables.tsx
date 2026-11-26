'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from 'lucide-react';

interface StockBySku {
  namaBarang: string;
  category: string;
  barcode: string;
  unit: string;
  totalQtySystem: number;
  totalSoh: number;
  rackCount: number;
  earliestExpiryDate: string;
  statusFefo: string;
  racks: string[];
  moreRacks: number;
}

interface StockDetail {
  nomorRak: string;
  namaBarang: string;
  qtySistem: number;
  soh: number;
  variance: number;
  akurasi: number;
  statusFefo: string;
  urutanFefo: number;
  stockPicking: number;
  tanggalInbound: string;
  tanggalExpired: string;
  expiredLabel: string;
  daysToExpiry: number;
  barcode: string;
  category: string;
  unit: string;
}

interface EnhancedStockTablesProps {
  skuData: StockBySku[];
  detailData: StockDetail[];
}

export function EnhancedStockTables({ skuData, detailData }: EnhancedStockTablesProps) {
  const [activeTab, setActiveTab] = useState<'sku' | 'detail'>('sku');

  // Search & Filter state
  const [skuSearch, setSkuSearch] = useState('');
  const [detailSearch, setDetailSearch] = useState('');

  // Sorting state
  const [skuSort, setSkuSort] = useState<{ key: keyof StockBySku | null; dir: 'asc' | 'desc' }>({
    key: null,
    dir: 'asc',
  });
  const [detailSort, setDetailSort] = useState<{ key: keyof StockDetail | null; dir: 'asc' | 'desc' }>({
    key: null,
    dir: 'asc',
  });

  // Pagination state (25 items per page)
  const PAGE_SIZE = 25;
  const [skuPage, setSkuPage] = useState(1);
  const [detailPage, setDetailPage] = useState(1);

  // Filtered & Sorted SKU Data
  const filteredSku = useMemo(() => {
    let result = skuData.filter(
      (s) =>
        s.namaBarang.toLowerCase().includes(skuSearch.toLowerCase()) ||
        s.category.toLowerCase().includes(skuSearch.toLowerCase()) ||
        s.barcode.toLowerCase().includes(skuSearch.toLowerCase())
    );

    if (skuSort.key) {
      const key = skuSort.key;
      result = [...result].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return skuSort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [skuData, skuSearch, skuSort]);

  // Paginated SKU Data
  const paginatedSku = useMemo(() => {
    const start = (skuPage - 1) * PAGE_SIZE;
    return filteredSku.slice(start, start + PAGE_SIZE);
  }, [filteredSku, skuPage]);

  // Filtered & Sorted Detail Data
  const filteredDetail = useMemo(() => {
    let result = detailData.filter(
      (d) =>
        d.namaBarang.toLowerCase().includes(detailSearch.toLowerCase()) ||
        d.nomorRak.toLowerCase().includes(detailSearch.toLowerCase()) ||
        d.category.toLowerCase().includes(detailSearch.toLowerCase())
    );

    if (detailSort.key) {
      const key = detailSort.key;
      result = [...result].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return detailSort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [detailData, detailSearch, detailSort]);

  // Paginated Detail Data
  const paginatedDetail = useMemo(() => {
    const start = (detailPage - 1) * PAGE_SIZE;
    return filteredDetail.slice(start, start + PAGE_SIZE);
  }, [filteredDetail, detailPage]);

  // CSV Export functions
  const exportSkuCSV = () => {
    const headers = ['Nama Barang,Kategori,Barcode,Qty Sistem,SOH,Jumlah Rak,Expired Terdekat,Status FEFO,Rak'];
    const rows = filteredSku.map((s) =>
      `"${s.namaBarang}","${s.category}","${s.barcode}",${s.totalQtySystem},${s.totalSoh},${s.rackCount},"${s.earliestExpiryDate}","${s.statusFefo}","${s.racks.join(', ')}"`
    );
    const blob = new Blob([[...headers, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inventory_sku_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportDetailCSV = () => {
    const headers = ['Rak,Nama Barang,Kategori,Qty Sistem,SOH,Variance,Akurasi,Status FEFO,Urutan FEFO,Stock Picking,Tgl Inbound,Tgl Expired,Hari Tersisa,Barcode'];
    const rows = filteredDetail.map((d) =>
      `"${d.nomorRak}","${d.namaBarang}","${d.category}",${d.qtySistem},${d.soh},${d.variance},${d.akurasi}%,"${d.statusFefo}",${d.urutanFefo},${d.stockPicking},"${d.tanggalInbound}","${d.tanggalExpired}",${d.daysToExpiry},"${d.barcode}"`
    );
    const blob = new Blob([[...headers, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inventory_detail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
      EXPIRED: 'destructive',
      'EXPIRED HARI INI': 'destructive',
      HABIS: 'secondary',
      OK: 'default',
    };
    return <Badge variant={variants[status] || 'outline'} className="text-xs">{status}</Badge>;
  };

  const fmtNum = (v: unknown): string =>
    typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString() : '0';

  const totalSkuPages = Math.ceil(filteredSku.length / PAGE_SIZE) || 1;
  const totalDetailPages = Math.ceil(filteredDetail.length / PAGE_SIZE) || 1;

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b">
        <div>
          <CardTitle className="text-lg">Tabel Inventaris & FEFO</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitoring level stok per item dan per lot rak gudang
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={activeTab === 'sku' ? exportSkuCSV : exportDetailCSV}
            className="flex items-center gap-1.5"
          >
            <Download className="h-4 w-4" />
            <span>Ekspor CSV</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'sku' | 'detail')} className="w-full">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
            <TabsList className="grid grid-cols-2 w-full sm:w-auto">
              <TabsTrigger value="sku">Ringkasan SKU ({filteredSku.length})</TabsTrigger>
              <TabsTrigger value="detail">Detail Lot Rak ({filteredDetail.length})</TabsTrigger>
            </TabsList>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={activeTab === 'sku' ? 'Cari nama barang / barcode...' : 'Cari rak / barang / kategori...'}
                value={activeTab === 'sku' ? skuSearch : detailSearch}
                onChange={(e) => {
                  if (activeTab === 'sku') {
                    setSkuSearch(e.target.value);
                    setSkuPage(1);
                  } else {
                    setDetailSearch(e.target.value);
                    setDetailPage(1);
                  }
                }}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>

          {/* TAB 1: SKU VIEW */}
          <TabsContent value="sku" className="mt-0">
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Nama Barang</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-right">Qty Sistem</TableHead>
                    <TableHead className="text-right">SOH</TableHead>
                    <TableHead className="text-right">Jml Rak</TableHead>
                    <TableHead>Expired Terdekat</TableHead>
                    <TableHead>Status FEFO</TableHead>
                    <TableHead>Lokasi Rak</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSku.map((row) => (
                    <TableRow key={row.namaBarang} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{row.namaBarang}</TableCell>
                      <TableCell>{row.category || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{row.barcode || '-'}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtNum(row.totalQtySystem)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(row.totalSoh)}</TableCell>
                      <TableCell className="text-right">{row.rackCount}</TableCell>
                      <TableCell>{row.earliestExpiryDate || '-'}</TableCell>
                      <TableCell>{getStatusBadge(row.statusFefo)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.racks.slice(0, 3).join(', ')}
                        {row.moreRacks > 0 && <span className="text-foreground"> +{row.moreRacks}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedSku.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                        Tidak ada data SKU ditemukan
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
              <div>
                Menampilkan {(skuPage - 1) * PAGE_SIZE + 1} - {Math.min(skuPage * PAGE_SIZE, filteredSku.length)} dari {filteredSku.length} item
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSkuPage((p) => Math.max(1, p - 1))}
                  disabled={skuPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 font-medium text-foreground">
                  {skuPage} / {totalSkuPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSkuPage((p) => Math.min(totalSkuPages, p + 1))}
                  disabled={skuPage === totalSkuPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: DETAIL RACK VIEW */}
          <TabsContent value="detail" className="mt-0">
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Rak</TableHead>
                    <TableHead>Nama Barang</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Qty Sistem</TableHead>
                    <TableHead className="text-right">SOH</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Akurasi</TableHead>
                    <TableHead>Status FEFO</TableHead>
                    <TableHead className="text-center">Urutan</TableHead>
                    <TableHead className="text-right">Picking</TableHead>
                    <TableHead>Expired</TableHead>
                    <TableHead className="text-center">Sisa Hari</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDetail.map((row, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="font-mono font-medium text-xs">{row.nomorRak}</TableCell>
                      <TableCell className="font-medium text-sm">{row.namaBarang}</TableCell>
                      <TableCell className="text-xs">{row.category || '-'}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(row.qtySistem)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(row.soh)}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums font-semibold',
                          row.variance < 0 ? 'text-destructive' : row.variance > 0 ? 'text-emerald-600' : ''
                        )}
                      >
                        {row.variance >= 0 ? '+' : ''}{fmtNum(row.variance)}
                      </TableCell>
                      <TableCell className="text-right">{fmtNum(row.akurasi)}%</TableCell>
                      <TableCell>{getStatusBadge(row.statusFefo)}</TableCell>
                      <TableCell className="text-center font-semibold text-xs">{row.urutanFefo ?? '-'}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(row.stockPicking)}</TableCell>
                      <TableCell className="text-xs">{row.expiredLabel || '-'}</TableCell>
                      <TableCell
                        className={cn(
                          'text-center text-xs font-semibold',
                          row.daysToExpiry < 0
                            ? 'text-destructive'
                            : row.daysToExpiry <= 30
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        )}
                      >
                        {row.daysToExpiry > 0 ? `${row.daysToExpiry}h` : row.daysToExpiry === 0 ? 'Hari ini' : 'Expired'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedDetail.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-6 text-muted-foreground">
                        Tidak ada data rak ditemukan
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
              <div>
                Menampilkan {(detailPage - 1) * PAGE_SIZE + 1} - {Math.min(detailPage * PAGE_SIZE, filteredDetail.length)} dari {filteredDetail.length} lot
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                  disabled={detailPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 font-medium text-foreground">
                  {detailPage} / {totalDetailPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setDetailPage((p) => Math.min(totalDetailPages, p + 1))}
                  disabled={detailPage === totalDetailPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}