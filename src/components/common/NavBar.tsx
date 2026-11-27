'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Package,
  PlusCircle,
  LayoutDashboard,
  LogOut,
  ChevronDown,
  UserCircle2,
  ClipboardCheck,
  QrCode,
  Users,
  Globe,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Calculator,
  AlertTriangle,
  BarChart2,
  TrendingUp,
  Package2,
  ClipboardList,
  Settings,
  Shield,
  FileText,
  Search,
  Warehouse,
  Boxes,
  Gavel,
  SlidersHorizontal,
  Target,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';
import { useEntity } from '@/hooks/useEntity';
import { ENTITY_OPTIONS, ENTITY_COLORS } from '@/lib/constants';

const ROLE_LABELS: Record<string, string> = {
  'super-admin': 'Super Admin',
  manager: 'Manager',
  operator: 'Operator',
};

const ROLE_BADGE: Record<string, string> = {
  'super-admin': 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  manager: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  operator: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
};

// ============================================================================
// NAVIGATION STRUCTURE: Grouped by operational context
// ============================================================================

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles: string[];
  badge?: string; // e.g., "NEW", "URGENT"
}

interface NavSection {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  collapsedLabel?: string; // Short label for collapsed tooltip context
}

const navSections: NavSection[] = [
  {
    key: 'utama',
    label: 'Utama',
    icon: LayoutDashboard,
    collapsedLabel: 'Utama',
    items: [
      { href: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['super-admin', 'manager', 'operator'] },
      { 
        href: '/replenishment', 
        icon: AlertTriangle, 
        label: 'Pusat Tindakan', 
        roles: ['super-admin', 'manager', 'operator'],
        badge: 'PRIORITAS' // Visual indicator for urgent stock alerts
      },
    ],
  },
  {
    key: 'operasional',
    label: 'Operasional Gudang',
    icon: Package2,
    collapsedLabel: 'Ops',
    items: [
      { href: '/inbound', icon: PlusCircle, label: 'Penerimaan (Inbound)', roles: ['super-admin', 'manager'] },
      { href: '/outbound', icon: Package, label: 'Picking List Generator', roles: ['super-admin', 'manager'] },
      { href: '/opname', icon: ClipboardCheck, label: 'Stock Opname', roles: ['super-admin', 'manager', 'operator'] },
      { href: '/labels', icon: QrCode, label: 'Label Rak & QR', roles: ['super-admin', 'manager'] },
    ],
  },
  {
    key: 'analisis',
    label: 'Analisis & Laporan',
    icon: BarChart2,
    collapsedLabel: 'Analisis',
    items: [
      { href: '/reports', icon: FileText, label: 'Laporan Persediaan', roles: ['super-admin', 'manager'] },
      { href: '/calculator', icon: Calculator, label: 'Kalkulator Persediaan', roles: ['super-admin', 'manager'] },
      { href: '/analytics', icon: TrendingUp, label: 'Analisis Lanjutan', roles: ['super-admin', 'manager'] },
    ],
  },
  {
    key: 'pengaturan',
    label: 'Pengaturan & Kepatuhan',
    icon: Settings,
    collapsedLabel: 'Setelan',
    items: [
      { href: '/calculator-settings', icon: SlidersHorizontal, label: 'Pengaturan Kalkulator', roles: ['super-admin', 'manager'] },
      { href: '/warehouse-optimization', icon: Warehouse, label: 'Optimalisasi Gudang', roles: ['super-admin', 'manager'] },
      { href: '/audit', icon: ShieldCheck, label: 'Audit & Kepatuhan', roles: ['super-admin', 'manager'] },
      { href: '/users', icon: Users, label: 'Manajemen Pengguna', roles: ['super-admin'] },
    ],
  },
];

export function NavBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const { entity, setEntity, options } = useEntity();
  
  // Sidebar state
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [entityMenuOpen, setEntityMenuOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const userMenuRef = useRef<HTMLDivElement>(null);
  const entityMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (entityMenuRef.current && !entityMenuRef.current.contains(target)) {
        setEntityMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Filter sections and items by role
  const filteredSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !role || item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);

  // Initialize all sections as open by default
  useEffect(() => {
    const initialState: Record<string, boolean> = {};
    filteredSections.forEach((s) => (initialState[s.key] = true));
    setOpenSections(initialState);
  }, [role]);

  const activeEntity = ENTITY_OPTIONS.find((o) => o.value === entity) || ENTITY_OPTIONS[0];

  // Check if a section has an active route
  const isSectionActive = (section: NavSection) =>
    section.items.some((item) => pathname === item.href);

  // Toggle section open/closed (only in non-collapsed mode)
  const toggleSection = (key: string) => {
    if (!collapsed) {
      setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  return (
    <>
      {/* Mobile Top Header */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-card border-b border-border px-4 h-16 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-muted text-foreground transition-colors"
            aria-label="Buka Menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
            <div className="p-1.5 bg-primary text-primary-foreground rounded-lg">
              <Package className="h-5 w-5" />
            </div>
            <span className="text-base tracking-tight">Inventory Control</span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile Entity Badge */}
          <button
            onClick={() => setEntityMenuOpen(!entityMenuOpen)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border',
              ENTITY_COLORS[entity].bg,
              ENTITY_COLORS[entity].text,
              ENTITY_COLORS[entity].border
            )}
          >
            <Globe className="h-3 w-3" />
            <span>{activeEntity.short}</span>
          </button>
        </div>
      </header>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar (Desktop & Mobile Drawer) */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-card border-r border-border transition-all duration-300 ease-in-out',
          collapsed ? 'w-20 lg:w-20' : 'w-72 lg:w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-border">
          <Link
            href="/"
            className={cn(
              'flex items-center gap-3 font-bold text-foreground overflow-hidden transition-all',
              collapsed && 'lg:justify-center lg:w-full'
            )}
          >
            <div className="p-2 bg-primary text-primary-foreground rounded-xl flex-shrink-0 shadow-sm">
              <Package className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col truncate">
                <span className="text-base font-bold leading-none tracking-tight">Inventory</span>
                <span className="text-[11px] text-muted-foreground mt-0.5">Vittoria Management</span>
              </div>
            )}
          </Link>

          {/* Collapse Toggle (Desktop only) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={collapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          {/* Mobile Close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-2 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Entity Selector Section */}
        <div className="p-3 border-b border-border relative" ref={entityMenuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEntityMenuOpen(!entityMenuOpen);
            }}
            className={cn(
              'w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all',
              ENTITY_COLORS[entity].bg,
              ENTITY_COLORS[entity].border,
              'hover:opacity-90 shadow-sm'
            )}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className={cn('p-1.5 rounded-lg bg-background/60', ENTITY_COLORS[entity].text)}>
                <Globe className="h-4 w-4 flex-shrink-0" />
              </div>
              {!collapsed && (
                <div className="flex flex-col text-left truncate">
                  <span className={cn('text-xs font-bold leading-tight', ENTITY_COLORS[entity].text)}>
                    {activeEntity.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Entitas Aktif</span>
                </div>
              )}
            </div>
            {!collapsed && <ChevronDown className={cn('h-4 w-4 transition-transform text-muted-foreground', entityMenuOpen && 'rotate-180')} />}
          </button>

          {/* Entity Dropdown Menu */}
          {entityMenuOpen && (
            <div className={cn(
              'absolute z-50 mt-2 rounded-xl bg-popover text-popover-foreground shadow-xl border border-border overflow-hidden p-1',
              collapsed ? 'left-full ml-2 w-56 top-3' : 'left-3 right-3'
            )}>
              <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Pilih Entitas Gudang
              </div>
              {options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEntity(opt.value);
                    setEntityMenuOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg font-medium text-left transition-colors hover:bg-muted',
                    entity === opt.value && 'bg-primary/10 text-primary font-semibold'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-2.5 w-2.5 rounded-full',
                      opt.value === 'BBB' ? 'bg-amber-500' : opt.value === 'BBT' ? 'bg-sky-500' : 'bg-purple-500'
                    )}
                  />
                  <span className="flex-1 truncate">{opt.label}</span>
                  {entity === opt.value && <span className="text-primary font-bold">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
          {filteredSections.map((section) => {
            const sectionOpen = openSections[section.key];
            const active = isSectionActive(section);

            return (
              <div key={section.key} className="space-y-1">
                {!collapsed && (
                  <button
                    onClick={() => toggleSection(section.key)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors hover:bg-muted/50',
                      'text-muted-foreground'
                    )}
                    style={{ paddingLeft: '0.75rem' }}
                  >
                    <section.icon className={cn('h-4 w-4 flex-shrink-0', sectionOpen ? '' : 'rotate-0')} />
                    <span className="flex-1 truncate">{section.label}</span>
                    {!sectionOpen && <ChevronDown className="h-4 w-4 transition-transform rotate-90 text-muted-foreground" />}
                    {sectionOpen && <ChevronDown className="h-4 w-4 transition-transform rotate-180 text-muted-foreground" />}
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </button>
                )}

                {/* Section Items - always visible in collapsed mode, conditionally in expanded */}
                <div
                  className={cn(
                    'overflow-hidden transition-all duration-200 ease-in-out',
                    !collapsed && !sectionOpen ? 'max-h-0 opacity-0' : 'max-h-96 opacity-100'
                  )}
                >
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative ml-1',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-md font-semibold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <item.icon className={cn('h-5 w-5 flex-shrink-0 transition-transform group-hover:scale-110', isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground')} />
                        {!collapsed && (
                          <span className="truncate flex-1">{item.label}</span>
                        )}
                        {!collapsed && item.badge && (
                          <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded bg-primary/20 text-primary border border-primary/30">
                            {item.badge}
                          </span>
                        )}

                        {/* Tooltip for collapsed mode */}
                        {collapsed && (
                          <div className="absolute left-full ml-3 px-3 py-1.5 bg-popover text-popover-foreground text-xs font-medium rounded-lg shadow-md border border-border whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                            {section.collapsedLabel} › {item.label}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* User Profile & Footer */}
        {session?.user && (
          <div className="p-3 border-t border-border relative" ref={userMenuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setUserMenuOpen(!userMenuOpen);
              }}
              className={cn(
                'w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition-colors text-left group',
                collapsed && 'justify-center'
              )}
            >
              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0 border border-primary/20">
                {session.user.email?.[0]?.toUpperCase() || 'U'}
              </div>
              {!collapsed && (
                <div className="flex flex-col truncate flex-1">
                  <span className="text-xs font-semibold text-foreground truncate">{session.user.email}</span>
                  <span className={cn('inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border mt-0.5 w-fit', ROLE_BADGE[role || 'operator'])}>
                    {ROLE_LABELS[role || 'operator']}
                  </span>
                </div>
              )}
            </button>

            {/* User Dropdown Menu */}
            {userMenuOpen && (
              <div className={cn(
                'absolute z-50 bottom-full mb-2 rounded-xl bg-popover text-popover-foreground shadow-xl border border-border overflow-hidden p-1',
                collapsed ? 'left-full ml-2 w-56 bottom-0' : 'left-3 right-3'
              )}>
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-semibold truncate text-foreground">{session.user.email}</p>
                  <p className="text-[11px] text-muted-foreground capitalize mt-0.5">Role: {role}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    signOut({ callbackUrl: '/login' });
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg font-medium transition-colors mt-1"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Keluar Sistem</span>
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}