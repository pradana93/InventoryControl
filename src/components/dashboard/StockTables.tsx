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
  const [skuSort, setSkuSort] = useState<{ key: keyof StockBySku | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });
  const [detailSort, setDetailSort] = useState<{ key: keyof StockDetail | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });

  const filteredSku = useMemo(() => {
    let result = skuData.filter((s) =>
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

  const filteredDetail = useMemo(() => {
    let result = detailData.filter((d) =>
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

  const SortIcon = ({ sortKey, currentSort, label, onSort }: {
    sortKey: string;
    currentSort: typeof skuSort | typeof detailSort;
    label: string;
    onSort: (key: any) => void;
  }) => (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      {currentSort.key === sortKey && (
        currentSort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      )}
      {currentSort.key !== sortKey && <ChevronDown className="h-3 w-3 text-muted-foreground/50" />}
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
                <TableHead className="cursor-pointer">
                  <SortIcon sortKey="namaBarang" currentSort={skuSort} label="Nama Barang" onSort={handleSkuSort} />
                </TableHead>
                <TableHead className="cursor-pointer">
                  <SortIcon sortKey="category" currentSort={skuSort} label="Kategori" onSort={handleSkuSort} />
                </TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead className="text-right cursor-pointer">
                  <SortIcon sortKey="totalQtySystem" currentSort={skuSort} label="Qty Sistem" onSort={handleSkuSort} />
                </TableHead>
                <TableHead className="text-right cursor-pointer">
                  <SortIcon sortKey="totalSoh" currentSort={skuSort} label="SOH" onSort={handleSkuSort} />
                </TableHead>
                <TableHead className="text-right cursor-pointer">
                  <SortIcon sortKey="rackCount" currentSort={skuSort} label="Jml Rak" onSort={handleSkuSort} />
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
                <TableHead className="cursor-pointer">
                  <SortIcon sortKey="nomorRak" currentSort={detailSort} label="Rak" onSort={handleDetailSort} />
                </TableHead>
                <TableHead className="cursor-pointer">
                  <SortIcon sortKey="namaBarang" currentSort={detailSort} label="Nama Barang" onSort={handleDetailSort} />
                </TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right cursor-pointer">
                  <SortIcon sortKey="qtySistem" currentSort={detailSort} label="Qty Sistem" onSort={handleDetailSort} />
                </TableHead>
                <TableHead className="text-right cursor-pointer">
                  <SortIcon sortKey="soh" currentSort={detailSort} label="SOH" onSort={handleDetailSort} />
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