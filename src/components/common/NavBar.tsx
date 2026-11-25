'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Package, PlusCircle, LayoutDashboard, LogOut, ChevronDown, UserCircle2, ClipboardCheck, QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
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