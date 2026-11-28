import { NextResponse } from 'next/server';
import { bulkUpsertCatalog, EntityFilter } from '@/lib/db';
import { auth } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const WRITE_ROLES = ['super-admin', 'manager'];

function assertCanWrite(role: string | undefined): string | null {
  if (!role || !WRITE_ROLES.includes(role)) {
    return 'Akses ditolak: hanya Super Admin dan Manager yang dapat mengimpor data master';
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role as string | undefined;
    const denied = assertCanWrite(role);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const entParam = formData.get('entity') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'File Excel wajib diunggah' }, { status: 400 });
    }

    const entity: EntityFilter =
      entParam === 'BBB' || entParam === 'BBT' || entParam === 'ALL' ? entParam : 'ALL';

    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

    if (jsonData.length < 2) {
      return NextResponse.json(
        { error: 'File Excel kosong atau hanya berisi header' },
        { status: 400 }
      );
    }

    const expectedHeaders = [
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

    const headers = jsonData[0] as string[];
    const headerMap = new Map<string, number>();
    expectedHeaders.forEach((h) => {
      const idx = headers.findIndex((col) => String(col ?? '').trim() === h);
      if (idx >= 0) headerMap.set(h, idx);
    });

    if (!headerMap.has('SKU ID') || !headerMap.has('Nama Barang')) {
      return NextResponse.json(
        { error: 'Header tidak valid. Kolom "SKU ID" dan "Nama Barang" wajib ada.' },
        { status: 400 }
      );
    }

    const get = (row: any[], key: string): string =>
      headerMap.has(key) ? String(row[headerMap.get(key)!] ?? '').trim() : '';

    const entries = [];
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] as any[];
      const skuId = get(row, 'SKU ID');
      if (!skuId) continue;

      const ent = get(row, 'Entitas').toUpperCase();
      const entitas: 'BBB' | 'BBT' = ent === 'BBT' ? 'BBT' : 'BBB';

      const unitCost = Number(get(row, 'Harga Satuan (Rp)').replace(/[^\d.-]/g, '')) || 0;
      const leadTimeDays = Math.max(0, Number(get(row, 'Lead Time (hari)')) || 3);
      const safetyStockDays = Math.max(0, Number(get(row, 'Safety Stock (hari)')) || 3);
      const statusStr = get(row, 'Status').toLowerCase();

      entries.push({
        skuId,
        namaBarang: get(row, 'Nama Barang'),
        satuan: get(row, 'Satuan') || 'Pcs',
        kategori: get(row, 'Kategori') || 'General',
        entitas,
        barcode: get(row, 'Barcode'),
        unitCost,
        leadTimeDays,
        safetyStockDays,
        activeFlag:
          statusStr !== 'nonaktif' &&
          statusStr !== 'inactive' &&
          statusStr !== 'false' &&
          statusStr !== '0',
      });
    }

    if (entries.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada data valid untuk diimpor' },
        { status: 400 }
      );
    }

    const result = await bulkUpsertCatalog(entries);

    await logAuditAction({
      userId: session?.user?.email || 'unknown',
      action: 'UPDATE',
      entity: 'catalog',
      recordId: 'bulk-import',
      newValues: {
        imported: entries.length,
        created: result.created,
        updated: result.updated,
        errors: result.errors.length,
        entity,
      },
    });

    return NextResponse.json({
      success: true,
      imported: entries.length,
      created: result.created,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Catalog import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal mengimpor data' },
      { status: 500 }
    );
  }
}
