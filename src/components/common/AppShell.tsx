'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { NavBar } from '@/components/common/NavBar';

// AppShell hides the global NavBar on the login page and provides a consistent layout
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  return (
    <>
      {!isLogin && (
        <Suspense fallback={<div className="h-[56px] bg-primary" />}>
          <NavBar />
        </Suspense>
      )}
      <main className="flex-1">{children}</main>
    </>
  );
}