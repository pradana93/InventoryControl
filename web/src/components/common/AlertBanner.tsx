'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, Clock, PackageX } from 'lucide-react';

interface AlertItem {
  namaBarang: string;
  nomorRak: string;
  qty: number;
  expiredDate?: string;
  daysLeft?: number;
}

interface AlertBannerProps {
  expired: AlertItem[];
  expiring: AlertItem[];
  outOfStock: string[];
}

export function AlertBanner({ expired, expiring, outOfStock }: AlertBannerProps) {
  const hasAlerts = expired.length > 0 || expiring.length > 0 || outOfStock.length > 0;

  if (!hasAlerts) return null;

  return (
    <div className="space-y-3 mb-6">
      {expired.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5" variant="outline">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <h3 className="text-lg font-semibold text-destructive">
                Kadaluarsa ({expired.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
              {expired.slice(0, 9).map((item, i) => (
                <div key={i} className="text-sm bg-background p-2 rounded border">
                  <div className="font-medium truncate">{item.namaBarang}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Rak: {item.nomorRak}</span>
                    <Badge variant="destructive" className="text-xs">{item.qty} qty</Badge>
                    {item.expiredDate && <span>{item.expiredDate}</span>}
                  </div>
                </div>
              ))}
              {expired.length > 9 && (
                <div className="text-xs text-muted-foreground col-span-full text-center py-2">
                  +{expired.length - 9} item lainnya
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {expiring.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5" variant="outline">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-5 w-5 text-yellow-600" />
              <h3 className="text-lg font-semibold text-yellow-700">
                Hampir Kadaluarsa (≤30 hari) ({expiring.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
              {expiring.slice(0, 9).map((item, i) => (
                <div key={i} className="text-sm bg-background p-2 rounded border">
                  <div className="font-medium truncate">{item.namaBarang}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Rak: {item.nomorRak}</span>
                    <Badge variant="secondary" className="text-xs">{item.qty} qty</Badge>
                    {item.daysLeft !== undefined && (
                      <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-500 bg-yellow-50">
                        {item.daysLeft} hari
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              {expiring.length > 9 && (
                <div className="text-xs text-muted-foreground col-span-full text-center py-2">
                  +{expiring.length - 9} item lainnya
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {outOfStock.length > 0 && (
        <Card className="border-muted/50 bg-muted/30" variant="outline">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <PackageX className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold text-muted-foreground">
                Stok Habis ({outOfStock.length})
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {outOfStock.slice(0, 15).map((sku, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {sku}
                </Badge>
              ))}
              {outOfStock.length > 15 && (
                <Badge variant="secondary" className="text-xs">
                  +{outOfStock.length - 15} lainnya
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}