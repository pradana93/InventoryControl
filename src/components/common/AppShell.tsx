'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { NavBar } from '@/components/common/NavBar';
import { SidebarProvider, useSidebar } from '@/components/common/SidebarContext';
import { cn } from '@/lib/utils';

// Layout body: keeps <main> in sync with the sidebar width so no dead gap
// remains when the sidebar is collapsed.
function ShellBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background flex">
      {!isLogin && (
        <Suspense fallback={<aside className="fixed inset-y-0 left-0 z-50 w-20 lg:w-72 bg-card border-r border-border" />}>
          <NavBar />
        </Suspense>
      )}

      <main
        className={cn(
          'flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out',
          !isLogin && (collapsed ? 'lg:ml-20' : 'lg:ml-72')
        )}
      >
        {/* Top spacing for mobile header */}
        <div className="lg:hidden h-16" />
        <div className="flex-1 min-w-0">{children}</div>
      </main>
    </div>
  );
}

// AppShell provides the overall layout structure with sidebar
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ShellBody>{children}</ShellBody>
    </SidebarProvider>
  );
}
