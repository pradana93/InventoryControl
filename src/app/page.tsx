import { DashboardContent } from '@/components/dashboard/DashboardContent';
import { DashboardTables } from '@/components/dashboard/DashboardTables';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Inventory Control</h1>
          <p className="text-muted-foreground mt-1">Dashboard Inbound &amp; Stok Gudang</p>
        </div>

        <DashboardContent />
        <DashboardTables />
      </div>
    </div>
  );
}