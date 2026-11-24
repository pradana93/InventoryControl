'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';

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

interface StockTablesProps {
  skuData: StockBySku[];
  detailData: StockDetail[];
}

export function StockTables({ skuData, detailData }: StockTablesProps) {
  const [skuSearch, setSkuSearch] = useState('');
  const [detailSearch, setDetailSearch] = useState('');
  const [skuSort, setSkuSort] = useState<{ key: keyof StockBySku | ''; dir: 'asc' | 'desc' }>({ key: '', dir: 'asc' });
  const [detailSort, setDetailSort] = useState<{ key: keyof StockDetail | ''; dir: 'asc' | 'desc' }>({ key: '', dir: 'asc' });

  const filteredSku = useMemo(() => {
    let result = skuData.filter((s) =>
      s.namaBarang.toLowerCase().includes(skuSearch.toLowerCase()) ||
      s.category.toLowerCase().includes(skuSearch.toLowerCase()) ||
      s.barcode.toLowerCase().includes(skuSearch.toLowerCase())
    );

    if (skuSort.key) {
      result = [...result].sort((a, b) => {
        const av = a[skuSort.key];
        const bv = b[skuSort.key];
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return skuSort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [skuData, skuSearch, skuSort]);

  const filteredDetail = useMemo(() => {
    let result = detailData.filter((d) =>
      d.namaBarang.toLowerCase().includes(detailSearch.toLowerCase()) ||
      d.nomorRak.toLowerCase().includes(detailSearch.toLowerCase()) ||
      d.category.toLowerCase().includes(detailSearch.toLowerCase())
    );

    if (detailSort.key) {
      result = [...result].sort((a, b) => {
        const av = a[detailSort.key];
        const bv = b[detailSort.key];
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return detailSort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [detailData, detailSearch, detailSort]);

  const handleSkuSort = (key: keyof StockBySku) => {
    setSkuSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleDetailSort = (key: keyof StockDetail) => {
    setDetailSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
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

  const SortIcon = ({ key, currentSort, label }: { key: string; currentSort: typeof skuSort; label: string }) => (
    <button
      onClick={() => key === 'sku' ? handleSkuSort(key as keyof StockBySku) : handleDetailSort(key as keyof StockDetail)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      {currentSort.key === key && (
        currentSort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      )}
      {currentSort.key !== key && <ChevronDown className="h-3 w-3 text-muted-foreground/50" />}
    </button>
  );

  return (
    <Tabs defaultValue="sku" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="sku">Ringkasan per SKU ({filteredSku.length})</TabsTrigger>
        <TabsTrigger value="detail">Detail per Lot/Rak ({filteredDetail.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="sku" className="mt-4">
        <div className="mb-4">
          <Input
            placeholder="Cari SKU, kategori, barcode..."
            value={skuSearch}
            onChange={(e) => setSkuSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleSkuSort('namaBarang')}>
                  <SortIcon key="sku" currentSort={skuSort} label="Nama Barang" />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSkuSort('category')}>
                  <SortIcon key="sku" currentSort={skuSort} label="Kategori" />
                </TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSkuSort('totalQtySystem')}>
                  <SortIcon key="sku" currentSort={skuSort} label="Qty Sistem" />
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSkuSort('totalSoh')}>
                  <SortIcon key="sku" currentSort={skuSort} label="SOH" />
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSkuSort('rackCount')}>
                  <SortIcon key="sku" currentSort={skuSort} label="Jml Rak" />
                </TableHead>
                <TableHead>Kadaluarsa Terdekat</TableHead>
                <TableHead>Status FEFO</TableHead>
                <TableHead>Rak</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSku.map((row) => (
                <TableRow key={row.namaBarang}>
                  <TableCell className="font-medium">{row.namaBarang}</TableCell>
                  <TableCell>{row.category || '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{row.barcode || '-'}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.totalQtySystem.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.totalSoh.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.rackCount}</TableCell>
                  <TableCell>{row.earliestExpiryDate || '-'}</TableCell>
                  <TableCell>{getStatusBadge(row.statusFefo)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.racks.slice(0, 3).join(', ')}
                    {row.moreRacks > 0 && <span> +{row.moreRacks} lainnya</span>}
                  </TableCell>
                </TableRow>
              ))}
              {filteredSku.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Tidak ada data SKU
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="detail" className="mt-4">
        <div className="mb-4">
          <Input
            placeholder="Cari SKU, Rak, Kategori..."
            value={detailSearch}
            onChange={(e) => setDetailSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleDetailSort('nomorRak')}>
                  <SortIcon key="detail" currentSort={detailSort} label="Rak" />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleDetailSort('namaBarang')}>
                  <SortIcon key="detail" currentSort={detailSort} label="Nama Barang" />
                </TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleDetailSort('qtySistem')}>
                  <SortIcon key="detail" currentSort={detailSort} label="Qty Sistem" />
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleDetailSort('soh')}>
                  <SortIcon key="detail" currentSort={detailSort} label="SOH" />
                </TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-right">Akurasi</TableHead>
                <TableHead>Status FEFO</TableHead>
                <TableHead>Urutan FEFO</TableHead>
                <TableHead className="text-right">Stock Picking</TableHead>
                <TableHead>Tgl Inbound</TableHead>
                <TableHead>Tgl Expired</TableHead>
                <TableHead>Hari</TableHead>
                <TableHead>Barcode</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDetail.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-sm">{row.nomorRak}</TableCell>
                  <TableCell className="font-medium">{row.namaBarang}</TableCell>
                  <TableCell className="text-xs">{row.category || '-'}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.qtySistem.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.soh.toLocaleString()}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', row.variance < 0 ? 'text-destructive' : row.variance > 0 ? 'text-green-600' : '')}>
                    {row.variance >= 0 ? '+' : ''}{row.variance.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">{row.akurasi.toFixed(1)}%</TableCell>
                  <TableCell>{getStatusBadge(row.statusFefo)}</TableCell>
                  <TableCell className="text-center">{row.urutanFefo}</TableCell>
                  <TableCell className="text-right">{row.stockPicking.toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{row.tanggalInbound || '-'}</TableCell>
                  <TableCell className={cn('text-xs', row.daysToExpiry < 0 ? 'text-destructive' : row.daysToExpiry <= 30 ? 'text-yellow-600' : '')}>
                    {row.expiredLabel || '-'}
                  </TableCell>
                  <TableCell className={cn('text-center text-xs', row.daysToExpiry < 0 ? 'text-destructive font-medium' : row.daysToExpiry <= 30 ? 'text-yellow-600 font-medium' : '')}>
                    {row.daysToExpiry > 0 ? row.daysToExpiry : row.daysToExpiry === 0 ? 'Hari ini' : `${Math.abs(row.daysToExpiry)} hari lalu`}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.barcode || '-'}</TableCell>
                </TableRow>
              ))}
              {filteredDetail.length === 0 && (
                <TableRow>
                  <TableCell colSpan={15} className="text-center py-8 text-muted-foreground">
                    Tidak ada data detail
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
    </Tabs>
  );
}