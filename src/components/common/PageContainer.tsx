import { cn } from '@/lib/utils';

type Width = 'narrow' | 'default' | 'wide' | 'full';

const WIDTH_CLASS: Record<Width, string> = {
  narrow: 'max-w-5xl',   // forms, labels — content that reads best in a column
  default: 'max-w-7xl',  // standard pages
  wide: 'max-w-[1600px]', // data-heavy tables & dashboards — use the room
  full: 'max-w-none',
};

interface PageContainerProps {
  children: React.ReactNode;
  width?: Width;
  className?: string;
}

/**
 * Standard page content wrapper. Keeps horizontal rhythm consistent across
 * views while letting data-heavy "Operate" surfaces (tables, dashboards) opt
 * into a wider canvas so their tables are not choked.
 */
export function PageContainer({ children, width = 'default', className }: PageContainerProps) {
  return (
    <div className={cn('p-6 space-y-6 mx-auto', WIDTH_CLASS[width], className)}>
      {children}
    </div>
  );
}
