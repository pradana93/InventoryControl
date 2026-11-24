'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

export function KPICard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  trend, 
  trendValue, 
  className 
}: KPICardProps) {
  return (
    <Card className={cn('relative overflow-hidden transition-shadow hover:shadow-md', className)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-2xl sm:text-3xl font-bold tabular-nums">{value}</p>
              {trend && trendValue && (
                <span className={cn(
                  'text-sm font-medium flex items-center gap-1',
                  trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-muted-foreground'
                )}>
                  {trend === 'up' && '▲'}
                  {trend === 'down' && '▼'}
                  {trend === 'neutral' && '●'}
                  {trendValue}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {icon && (
            <div className="text-muted-foreground/30 text-4xl sm:text-5xl flex-shrink-0 ml-4">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}