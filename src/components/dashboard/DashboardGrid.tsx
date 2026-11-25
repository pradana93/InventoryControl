'use client';

import { useState, useEffect } from 'react';
import { Responsive } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = (Responsive as any).WidthProvider(Responsive);

export function DashboardGrid({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <ResponsiveGridLayout
      className="layout"
      breakpoints={{ xl: 1280, lg: 1024, md: 768, sm: 640, xs: 0 }}
      cols={{ xl: 12, lg: 8, md: 4, sm: 2, xs: 1 }}
      rowHeight={100}
      margin={[16, 16]}
    >
      {children}
    </ResponsiveGridLayout>
  );
}