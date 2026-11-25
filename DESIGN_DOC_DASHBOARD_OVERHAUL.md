# Dashboard Overhaul - Approach 2: Modular Widget Grid with SSE & Role-Based Views

## Design Overview

This document describes the full redesign of the Inventory Control Dashboard, moving from the current monolithic layout to a modular, draggable widget grid with real-time updates, authentication, and role-based access control.

---

## 1. Architecture Overview

### 1.1 Tech Stack
- **Next.js 16** with App Router (Server Components + Client Components)
- **NextAuth.js** for authentication (Google + Credentials provider)
- **Tailwind CSS v4** with dark mode
- **recharts** for advanced charts
- **react-grid-layout** for draggable/resizable widget grid
- **SSE** (Server-Sent Events) for real-time polling (30s interval)
- **Google Sheets API** via service account (source of truth)

### 1.2 Data Flow
```
Google Sheets (Source of Truth)
    │
    ├─ /api/dashboard (GET)          → Full KPI/charts data
    ├─ /api/dashboard/stream (GET)   → SSE endpoint for real-time updates
    ├─ /api/sku (GET)                → SKU lookup & rack stock
    ├─ /api/inbound (POST)           → Submit new inbound transaction
    └─ /api/auth                     → NextAuth.js sessions
```

### 1.3 Key Design Principles
- **Mobile-first responsive** - widgets stack gracefully on small screens
- **Role-based views** - Super Admin (full access), Manager (edit + view), Operator (view only)
- **Real-time without WebSocket complexity** - SSE with 30s polling interval
- **Offline-capable** - widgets refresh on mount, SSE reconnects automatically
- **Accessibility** - keyboard navigation, screen reader friendly, high contrast

---

## 2. Authentication & Authorization

### 2.1 NextAuth.js Configuration

**Provider**: Google + Credentials (email allowlist)

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

const AUTH_EMAILS = [
  'majestap93@gmail.com', // Super Admin
  // Manager emails
  'manager@inventory.id',
  // Operator emails
  'operator@inventory.id',
];

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text', placeholder: 'masuk@inventory.id' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        // Allowlist check
        if (!AUTH_EMAILS.includes(email)) {
          throw new Error('Email tidak terdaftar. Hubungi Super Admin.');
        }
        // In production, verify against DB; for now allow listed emails
        return { id: email, name: email, email, role: getRole(email) };
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token?.role) {
        session.user.role = token.role;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user?.role) {
        token.role = user.role;
      }
      return token;
    },
  },
  pages: {
    signIn: '/login',
  },
};

export handler = NextAuth(authOptions);
function GET(request) { return handler.GET(request) }
function POST(request) { return handler.POST(request) }
```

### 2.2 Role Definitions

| Role | Access |
|------|--------|
| `super-admin` | All routes, can manage users, full dashboard access, can configure sheets |
| `manager` | All dashboard widgets, can submit inbound, view outbound requests |
| `operator` | KPI cards + tables view only; cannot access inbound form or configuration |

### 2.3 Role-Based Middleware

```typescript
// src/middleware.ts
import { withAuth } from 'next-auth/middleware';

export default withAuth(
  function middleware(req) {
    const { role } = req.next.auth || {};
    const path = req.next.url;

    // Role-based redirects
    if (path.startsWith('/inbound') && role !== 'super-admin' && role !== 'manager') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    if (path.startsWith('/login') && (role === 'super-admin' || role === 'manager' || role === 'operator')) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // Public paths that don't need auth
        const path = req.next.url;
        const publicPaths = ['/login', '/'];
        return publicPaths.includes(path) || token?.role !== null;
      },
    },
  }
);
```

---

## 3. Widget Grid System

### 3.1 Widget Library

Each widget is an independent React component with its own data fetching:

| Widget | Type | Data Source | Refresh |
|--------|------|-------------|---------|
| `KPIWidget` | Metric card | `/api/dashboard` | On mount + SSE |
| `TopSKUChart` | Bar chart | `/api/dashboard` | On mount + SSE |
| `ZoneDistribution` | Doughnut chart | `/api/dashboard` | On mount + SSE |
| `VarianceWaterfall` | Bar chart | `/api/dashboard` | On mount + SSE |
| `AccuracyGauge` | Donut gauge | `/api/dashboard` | On mount + SSE |
| `StockTable` | Paginated table | `/api/sku?action=stock` | On mount |
| `ExpiryFEFO` | Timeline chart | `/api/inventory/lots` | On mount + SSE |
| `PickingListPreview` | Grid preview | Custom | Manual refresh |

### 3.2 Grid Layout Configuration

```typescript
// src/components/dashboard/WidgetConfig.ts
import ReactGridLayout from 'react-grid-layout';

const Widget = ReactGridLayout.Widget;

export const WIDGET_SPEC = {
  kpi: { x: 0, y: 0, w: 6, h: 4 },        // Full width on mobile
  topSKU: { x: 0, y: 4, w: 6, h: 6 },     // Bar chart
  zoneChart: { x: 6, y: 4, w: 6, h: 6 },   // Doughnut chart
  variance: { x: 0, y: 10, w: 6, h: 4 },   // Waterfall
  accuracy: { x: 6, y: 10, w: 6, h: 4 },   // Gauge
  stockTable: { x: 0, y: 14, w: 24, h: 20 }, // Full width table
  expiryTimeline: { x: 0, y: 34, w: 12, h: 8 }, // FEFO timeline
  pickingPreview: { x: 12, y: 34, w: 12, h: 8 }, // Picking list preview
};
```

### 3.3 Breakpoints

| Screen | Columns | Widget Spacing |
|--------|---------|----------------|
| `xs` (<640px) | 1 column | 10px gutters |
| `sm` (≥640px) | 2 columns | 12px gutters |
| `md` (≥768px) | 4 columns | 16px gutters |
| `lg` (≥1024px) | 8 columns | 20px gutters |
| `xl` (≥1280px) | 12 columns | 24px gutters |

### 3.4 Widget Layout Example (Desktop)

```
┌─────────────────────────────────────────────────────┐
│  KPI Widget (full width on mobile, 6 cols on desktop)│
├─────────┬─────────┬─────────┬─────────┬─────────┤
│ Top SKU │ Zone    │ Variance│ Accuracy│           │
│ Chart │ Doughnut│ Waterfall│ Gauge   │           │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│ Stock   │ Stock   │ Expiry  │ Picking │           │
│ Table │ Timeline│ FEFO    │ Preview │           │
├─────────┼─────────┼─────────┼─────────┼─────────┤
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

---

## 4. Real-Time Updates via SSE

### 4.1 SSE Endpoint

```typescript
// src/app/api/dashboard/stream/route.ts
import { NextResponse } from 'next/server';

export const revalidate = 0; // Prevent Next.js caching

export async function GET() {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Send initial data
  const initialData = await fetchDashboardData();
  writer.write(`data: ${JSON.stringify(initialStatus)}\n\n`;

  // Keep connection alive and reconnect on error
  const interval = setInterval(async () => {
    try {
      const data = await fetchDashboardData();
      writer.write(`event: update\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      // Silently retry
    }
  }, 30000); // 30-second interval

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### 4.2 Client-Side SSE Hook

```typescript
// src/lib/use-sse.ts
import { useEffect, useState } from 'react';

export function useSSE(url: string, interval = 30000) {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const evtSource = new EventSource(url, {
      withCredentials: true,
    });

    evtSource.onopen = () => setConnected(true);
    evtSource.onmessage = (event) => {
      setData(event.data);
    };
    evtSource.onerror = () => setConnected(false);
    evtSource.reconnect = true;

    return () => {
      evtSource.close();
    };
  }, [url]);

  return { data, connected };
}
```

### 4.3 Widget Integration

```typescript
// src/components/dashboard/KPIWidget.tsx
import { useSSE } from '@/lib/use-sse';

export function KPIWidget() {
  const { data: dashboardData, connected } = useSSE('/api/dashboard/stream');
  
  useEffect(() => {
    if (dashboardData) {
      // Update state from SSE
    }
  }, [dashboardData]);

  return (/* KPI cards */);
}
```

---

## 5. Advanced Charts (recharts)

### 5.1 Chart Specifications

#### 5.1.1 FEFO Timeline Chart
- **Type**: Vertical bar chart with color coding
- **X-axis**: Rack codes sorted by expiry date (earliest first)
- **Y-axis**: Quantity
- **Color**: 
  - Red = expired/hari ini
  - Orange = expiring within 7 days
  - Yellow = expiring within 30 days
  - Green = ok stock

#### 5.1.2 Variance Waterfall Chart
- **Type**: Waterfall chart showing:
  - Starting SOH
  - + Inbound this period
  - - Outbound this period
  - = Current SOH
  - ± Variance explanation

#### 5.1.3 Accuracy Gauge
- **Type**: Donut gauge (0-100%)
- **Color gradient**:
  - 95-100%: Green
  - 90-95%: Yellow
  - <90%: Red
- **Display**: Percentage with trend indicator

#### 5.1.4 Zone Heatmap
- **Type**: Sequential color grid
- **Axes**: Zone (A-H) vs Rack position
- **Color intensity**: Stock quantity

### 5.2 recharts Implementation Example

```typescript
// src/components/dashboard/VarianceWaterfall.tsx
import { WaterfallChart, Waterfall, WaterfallItem } from 'recharts';

export function VarianceWaterfall({ totalSOH, inboundQty, outboundQty, variance }) {
  return (
    <WaterfallChart data={[{ totalSOH, inboundQty, outboundQty, variance }]} stackId="war">
      <Waterfall itemStyle={{ fill: '#8884d8' }}>
        <WaterfallItem dataKey="totalSOH" name="SOH Awal" color="#8884d8" />
        <WaterfallItem dataKey="inboundQty" name="Inbound" color="#8884d8" />
        <WaterfallItem dataKey="outboundQty" name="Outbound" color="#8884d8" />
        <WaterfallItem dataKey="variance" name="Variance" color="#8884d8" />
      </Waterfall>
    </WaterfallChart>
  );
}
```

---

## 6. Enhanced Tables with Server-Side Features

### 6.1 Table Features
- **Server-side pagination** (25 rows per page)
- **Column filters** per column
- **Sortable headers** with persistent state
- **Column visibility toggle**
- **CSV export** button
- **Export to PDF** option

### 6.2 Pagination Implementation

```typescript
// src/app/api/sku/route.ts - with pagination
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '25');
  const search = searchParams.get('search') || '';
  const sortBy = searchParams.get('sortBy') || 'namaBarang';
  const sortDir = searchParams.get('sortDir') || 'asc';

  const lots = await getInventoryLots();
  // ... filtering, sorting, pagination logic
  
  return NextResponse.json({
    data: pageData,
    total: totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit),
  });
}
```

### 6.3 Table Component with All Features

```typescript
// src/components/dashboard/EnhancedStockTables.tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useTable } from '@/lib/use-table-hook'; // custom hook with pagination/filtering
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export function EnhancedStockTables({ search, sortBy, sortDir, onFilterChange }) {
  const { data, state } = useTable('/api/sku', {
    search, sortBy, sortDir,
    page: 1, limit: 25,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Stok Inventory</CardTitle>
        <div className="flex items-center gap-2">
          <Input placeholder="Cari SKU..." value={search} onChange={/* filter */} className="max-w-xs" />
          <Button variant="secondary" size="sm" onClick={() => exportCSV(state.data)}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onSort={/* namaBarang */}>Nama Barang</TableHead>
              <TableHead className="cursor-pointer" onSort={/* kategori */}>Kategori</TableHead>
              <TableHead className="text-right cursor-pointer" onSort={/* qtySistem */}>Qty Sistem</TableHead>
              <TableHead className="text-right cursor-pointer" onSort={/* soh */}>SOH</TableHead>
              <TableHead className="text-right cursor-pointer" onSort={/* variance */}>Variance</TableHead>
              <TableHead>Akurasi</TableHead>
              <TableHead>Status FEFO</TableHead>
              <TableHead>Rak</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.namaBarang}>
                <TableCell>{row.namaBarang}</TableCell>
                <TableCell>{row.category || '-'}</TableCell>
                <TableCell className="text-right tabular-nums">{row.totalQtySystem.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{row.totalSoh.toLocaleString()}</TableCell>
                <TableCell className={cn('text-right', row.variance < 0 ? 'text-destructive' : 'text-green-600')}>
                  {row.variance >= 0 ? '+' : ''}{row.variance.toLocaleString()}
                </TableCell>
                <TableCell>{row.akurasi.toFixed(1)}%</TableCell>
                <TableCell>{getStatusBadge(row.statusFefo)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.racks.join(', ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm">
            Menampilkan {state.from} hingga {state.to} dari {state.total} data
          </p>
          <div className="flex gap-2">
            {state.hasPrevious && (
              <Button size="icon" onClick={() => state.setPage(state.page - 1)}>
                <ChevronLeft />
              </Button>
            )}
            {state.hasNext && (
              <Button size="icon" onClick={() => state.setPage(state.page + 1)}>
                <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 7. Login Page & Role-Based Redirect

### 7.1 Login Page Design

```typescript
// src/app/login/page.tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, LogIn } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Login gagal');
      
      // Redirect based on role
      const role = result.user.role;
      const redirects = {
        'super-admin': '/dashboard',
        'manager': '/dashboard',
        'operator': '/dashboard',
      };
      
      setLoading(false);
      window.location.href = redirects[role] || '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan');
      setLoading(false);
    }
  };

  return (
    <min-h-screen bg-background>
      <div className="container mx-auto py-12 px-4 max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md mx-auto">
          <div className="text-center mb-6">
            <LogIn className="h-12 w-12 mx-auto text-primary mb-4" />
            <h2 className="text-3xl font-bold tracking-tight">Masuk ke Inventory Control</h2>
            <p className="text-muted-foreground text-sm">Silakan masuk untuk melanjutkan</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-4 w-4 mr-2 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="masuk@inventory.id"
                required
              />
            </div>
            <div>
              <Label>Kata Sandi</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Masuk...' : 'Masuk ke Sistem'}
            </Button>
          </form>
        </div>
      </div>
    </min-h-screen>
  );
}
```

### 7.2 Role-Based Route Protection

```typescript
// src/components/dashboard/role-based-layout.tsx
import { DashboardLayout } from '@/components/dashboard/SuperAdminLayout';
import { ManagerLayout } from '@/components/dashboard/ManagerLayout';
import { OperatorLayout } from '@/components/dashboard/OperatorLayout';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const role = useUserRole(); // from next-auth session
  
  const layouts: Record<string, React.ComponentType> = {
    'super-admin': SuperAdminLayout,
    'manager': ManagerLayout,
    'operator': OperatorLayout,
  };

  const LayoutComponent = layouts[role] || OperatorLayout;
  
  return <LayoutComponent>{children}</LayoutComponent>;
}
```

### 7.3 Layout Variations

#### Super Admin Layout
- Full access to all widgets
- Configuration panel for sheet management
- User management UI
- All charts and tables

#### Manager Layout
- All KPI widgets
- Top SKU, Zone distribution charts
- Full stock tables with pagination
- Inbound form access
- Can view outbound requests

#### Operator Layout
- KPI cards only (read-only)
- Basic stock table (paginated, filtered)
- No access to inbound form
- No chart customization
- Simple dashboard view

---

## 8. Inbound Form Integration

### 8.1 Form Flow
1. User navigates to `/inbound` (role-checked)
2. Server Component wrapper loads SKU options from API
3. Client Component renders the form
4. Form validation on submit
5. POST to `/api/inbound` with all allocations
6. Success toast + redirect or reset

### 8.2 Inbound Form Components

```typescript
// src/app/inbound/page.tsx - Server Component
import { InboundForm } from './InboundForm';

export default function InboundPage() {
  // Role check
  const { role } = useUserRole();
  if (role !== 'super-admin' && role !== 'manager') {
    return <p className="text-destructive">Akses ditolak</p>;
  }
  
  return <InboundForm />;
}
```

```typescript
// src/app/inbound/InboundForm.tsx - Client Component (already exists, will be enhanced)
```

### 8.3 Form Field Validation

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Pallet code | text | optional | Format: PLT-XXX |
| SKU dropdown | select | yes | Must select from list |
| SJ number | text | optional | Format: SJ-YYYY/XX/NNN |
| Inbound date | date | yes | Must be today or past |
| Expired date | date | yes | Must be after inbound date |
| Rack allocations (max 6) | select + number | conditional | If qty > 0, rack must be selected |
| Remarks | textarea | optional | Max 200 characters |

---

## 9. Mobile Responsiveness

### 9.1 Breakpoint Adaptations

| Widget | Mobile (1 col) | Tablet (2 cols) | Desktop (3+ cols) |
|--------|----------------|-----------------|-------------------|
| KPI | Full width stack | 2 per row | 3 per row |
| Charts | Full width stack | 2 per row | 2-3 per row |
| Tables | Full width, horizontal scroll | 2 col sections | Full width |

### 9.2 Touch-Friendly Interactions
- Minimum 44px tap targets
- Swipe gestures for table column swipe-to-filter (mobile)
- Long-press for menu actions
- Keyboard navigation support (Tab/Shift+Tab)

### 9.3 Responsive Grid Example

```typescript
// React Grid Layout responsive
<GridLayout
  cols={{ base: 1, sm: 2, md: 4, lg: 8, xl: 12 }}
  rowHeight={100}
  width={1280}
>
  {/* Widgets automatically reflow based on cols */}
</GridLayout>
```

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [x] Set up NextAuth.js with email allowlist
- [ ] Create login page with role redirect
- [ ] Implement role-based middleware
- [ ] Configure environment variables

### Phase 2: Widget Grid (Week 2)
- [ ] Install react-grid-layout
- [ ] Create widget components (KPI, charts, tables)
- [ ] Implement SSE endpoint
- [ ] Build draggable grid layout

### Phase 3: Advanced Charts (Week 3)
- [ ] Implement FEFO timeline chart (recharts)
- [ ] Implement Variance waterfall chart
- [ ] Implement Accuracy gauge
- [ ] Add zone heatmap

### Phase 4: Enhanced Tables (Week 4)
- [ ] Server-side pagination
- [ ] Column filters
- [ ] CSV export
- [ ] Sortable headers

### Phase 5: Role-Based Views (Week 5)
- [ ] Super Admin layout
- [ ] Manager layout
- [ ] Operator layout
- [ ] Middleware protection

### Phase 6: Testing & Deployment (Week 6)
- [ ] End-to-end testing
- [ ] Mobile responsiveness validation
- [ ] Vercel deployment
- [ ] Monitoring & logs

---

## 11. Environment Variables Required

```
# Authentication
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_EMAIL=inventory-sheets-api@inventory-control-515709.iam.gserviceaccount.com
GOOGLE_SHEET_ID=1WxJNJrvez9Du_IlyL1jhLQIn8haXBN-azFB0acOkRpw

> **Note**: The Google Private Key should be stored securely via Vercel environment variables
> or a secret manager. Do NOT commit actual private key values to the repository.

# NextAuth
NEXTAUTH_URL=https://inventory-control-five.vercel.app
NEXTAUTH_SECRET=your-nextauth-secret

# App
NODE_ENV=production
```

---

## 12. Migration Path from Current System

1. **Auth**: Add NextAuth.js alongside existing session (no breaking changes)
2. **Dashboard**: Replace `DashboardContent` with new widget grid
3. **Tables**: Replace `StockTables` with `EnhancedStockTables`
4. **Inbound**: Enhance existing `InboundForm` with new validations
5. **API**: Add `/api/dashboard/stream` SSE endpoint
6. **Layout**: Add role-based layout wrappers
7. **Gradual rollout**: Feature flags can toggle between old/new dashboard

---

*Document generated for Inventory Control Dashboard overhaul, Approach 2*