import { DashboardView } from '@/components/dashboard/DashboardView';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="container mx-auto">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Inventory Dashboard</h1>
          <p className="text-muted-foreground text-base">Pantau stok gudang secara real-time</p>
        </div>
        <DashboardView />
      </div>
    </div>
  );
}