'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
  toggleCollapsed: () => {},
});

const STORAGE_KEY = 'sidebar-collapsed';

/**
 * Shares the sidebar collapse state between NavBar (renders the sidebar) and
 * AppShell (offsets the main content). Persists the choice to localStorage so
 * the layout does not flash between states on reload.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Restore persisted preference after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') setCollapsedState(true);
    } catch {
      // localStorage unavailable (private mode) — keep default.
    }
    setHydrated(true);
  }, []);

  const setCollapsed = (value: boolean) => {
    setCollapsedState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Ignore persistence failures.
    }
  };

  const toggleCollapsed = () => setCollapsed(!collapsed);

  return (
    <SidebarContext.Provider value={{ collapsed: hydrated ? collapsed : false, setCollapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
