import { NextResponse } from 'next/server';
import {
  getCatalog,
  getSKUById,
  createCatalogEntry,
  updateCatalogEntry,
  deleteCatalogEntry,
  EntityFilter,
} from '@/lib/db';
import { auth } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Roles permitted to modify master data. */
const WRITE_ROLES = ['super-admin', 'manager'];

function assertCanWrite(role: string | undefined): string | null {
  if (!role || !WRITE_ROLES.includes(role)) {
    return 'Akses ditolak: hanya Super Admin dan Manager yang dapat mengubah data master';
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entParam = searchParams.get('ent')?.toUpperCase();

    const entity: EntityFilter =
      entParam === 'BBB' || entParam === 'BBT' || entParam === 'ALL' ? entParam : 'ALL';

    const catalog = await getCatalog({ entity });
    return NextResponse.json(catalog);
  } catch (error) {
    console.error('Catalog API error:', error);
    return NextResponse.json(
      { error: 'Failed to load catalog data', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role as string | undefined;
    const denied = assertCanWrite(role);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    const body = await request.json();

    if (!body.skuId || !body.namaBarang || !body.entitas) {
      return NextResponse.json(
        { error: 'SKU ID, Nama Barang, dan Entitas wajib diisi' },
        { status: 400 }
      );
    }

    // Reject duplicate SKU IDs early with a clear message.
    const existing = await getSKUById(body.skuId);
    if (existing) {
      return NextResponse.json(
        { error: `SKU ID "${body.skuId}" sudah terdaftar` },
        { status: 409 }
      );
    }

    const created = await createCatalogEntry({
      skuId: String(body.skuId).trim(),
      namaBarang: String(body.namaBarang).trim(),
      satuan: body.satuan || 'Pcs',
      kategori: body.kategori || 'General',
      entitas: body.entitas,
      barcode: body.barcode || '',
      unitCost: Number(body.unitCost) || 0,
      leadTimeDays: Number(body.leadTimeDays) || 3,
      safetyStockDays: Number(body.safetyStockDays) || 3,
      status: body.status || 'Active',
      activeFlag: body.activeFlag ?? true,
    });

    await logAuditAction({
      userId: session?.user?.email || 'unknown',
      action: 'INSERT',
      entity: 'catalog',
      recordId: created.skuId,
      newValues: { ...created, entitas: created.entitas } as unknown as Record<string, unknown>,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Catalog POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal membuat SKU' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role as string | undefined;
    const denied = assertCanWrite(role);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    const body = await request.json();
    const skuId = body.skuId;
    if (!skuId) {
      return NextResponse.json({ error: 'SKU ID wajib diisi' }, { status: 400 });
    }

    const before = await getSKUById(skuId);
    if (!before) {
      return NextResponse.json({ error: `SKU "${skuId}" tidak ditemukan` }, { status: 404 });
    }

    const updated = await updateCatalogEntry(skuId, {
      namaBarang: body.namaBarang,
      satuan: body.satuan,
      kategori: body.kategori,
      barcode: body.barcode,
      unitCost: body.unitCost !== undefined ? Number(body.unitCost) || 0 : undefined,
      leadTimeDays: body.leadTimeDays !== undefined ? Number(body.leadTimeDays) || 0 : undefined,
      safetyStockDays: body.safetyStockDays !== undefined ? Number(body.safetyStockDays) || 0 : undefined,
      status: body.status,
      activeFlag: body.activeFlag,
    });

    await logAuditAction({
      userId: session?.user?.email || 'unknown',
      action: 'UPDATE',
      entity: 'catalog',
      recordId: skuId,
      oldValues: before as unknown as Record<string, unknown>,
      newValues: updated as unknown as Record<string, unknown>,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Catalog PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memperbarui SKU' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role as string | undefined;
    const denied = assertCanWrite(role);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const skuId = searchParams.get('skuId');
    if (!skuId) {
      return NextResponse.json({ error: 'Parameter skuId wajib diisi' }, { status: 400 });
    }

    const before = await getSKUById(skuId);
    if (!before) {
      return NextResponse.json({ error: `SKU "${skuId}" tidak ditemukan` }, { status: 404 });
    }

    await deleteCatalogEntry(skuId);

    await logAuditAction({
      userId: session?.user?.email || 'unknown',
      action: 'DELETE',
      entity: 'catalog',
      recordId: skuId,
      oldValues: before as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, skuId });
  } catch (error) {
    console.error('Catalog DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal menghapus SKU' },
      { status: 500 }
    );
  }
}
