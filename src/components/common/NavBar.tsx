'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Package, PlusCircle, LayoutDashboard, LogOut, ChevronDown, UserCircle2, ClipboardCheck, QrCode, Users, Globe } from 'lucide-react';
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
  'super-admin': 'bg-amber-500/20 text-amber-100 border-amber-400/40',
  manager: 'bg-sky-500/20 text-sky-100 border-sky-400/40',
  operator: 'bg-emerald-500/20 text-emerald-100 border-emerald-400/40',
};

export function NavBar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const { entity, setEntity, options } = useEntity();
  const [menuOpen, setMenuOpen] = useState(false);
  const [entityMenuOpen, setEntityMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const entityMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (entityMenuRef.current && !entityMenuRef.current.contains(target)) {
        setEntityMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const navItems = [
    { href: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['super-admin', 'manager', 'operator'] },
    { href: '/inbound', icon: PlusCircle, label: 'Inbound', roles: ['super-admin', 'manager'] },
    { href: '/outbound', icon: Package, label: 'Outbound', roles: ['super-admin', 'manager'] },
    { href: '/opname', icon: ClipboardCheck, label: 'Stock Opname', roles: ['super-admin', 'manager', 'operator'] },
    { href: '/labels', icon: QrCode, label: 'Label Rak', roles: ['super-admin', 'manager'] },
    { href: '/users', icon: Users, label: 'Pengguna', roles: ['super-admin'] },
  ].filter((item) => !role || item.roles.includes(role));

  return (
    <nav className="bg-primary text-primary-foreground shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <Package className="h-6 w-6" />
          <span className="hidden sm:inline">Inventory Control</span>
        </Link>

        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-4 sm:gap-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 text-sm font-medium transition-colors hover:text-white/80',
                  pathname === item.href ? 'text-white' : 'text-primary-foreground/70'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ))}
          </div>

          {/* Entity Selector */}
          <div className="relative pl-4 border-l border-white/20" ref={entityMenuRef}>
            <button
              onClick={() => setEntityMenuOpen((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                ENTITY_COLORS[entity].bg,
                ENTITY_COLORS[entity].text,
                ENTITY_COLORS[entity].border
              )}
              title="Ganti entitas"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{ENTITY_OPTIONS.find((o) => o.value === entity)?.short}</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', entityMenuOpen && 'rotate-180')} />
            </button>

            {entityMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg bg-popover text-popover-foreground shadow-lg border border-border overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Pilih Entitas
                  </p>
                </div>
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setEntity(opt.value);
                      setEntityMenuOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors hover:bg-muted',
                      entity === opt.value && 'bg-muted/60 font-medium'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-2 w-2 rounded-full',
                        opt.value === 'BBB' ? 'bg-amber-500' : opt.value === 'BBT' ? 'bg-sky-500' : 'bg-purple-500'
                      )}
                    />
                    <span className="flex-1 truncate">{opt.label}</span>
                    {entity === opt.value && <span className="text-xs text-primary">●</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {status === 'authenticated' && session?.user && (
            <div className="relative pl-4 border-l border-white/20" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 text-sm hover:text-white/80 transition-colors"
              >
                <UserCircle2 className="h-6 w-6" />
                <span className="hidden md:inline max-w-[140px] truncate">{session.user.email}</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', menuOpen && 'rotate-180')} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-lg bg-popover text-popover-foreground shadow-lg border border-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm font-medium truncate">{session.user.email}</p>
                    <span
                      className={cn(
                        'inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                        ROLE_BADGE[role || 'operator']
                      )}
                    >
                      {ROLE_LABELS[role || 'operator']}
                    </span>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-destructive hover:bg-muted transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Keluar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}