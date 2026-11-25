'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

export interface DashboardSummary {
  totalSKU: number;
  totalSystemQty: number;
  totalSOH: number;
  variance: number;
  accuracy: number;
  expiredCount: number;
  expiringCount: number;
  outOfStockCount: number;
  emptySlots: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  alerts: {
    expired: Array<{ namaBarang: string; nomorRak: string; qty: number; expiredDate: string }>;
    expiring: Array<{ namaBarang: string; nomorRak: string; qty: number; expiredDate: string; daysLeft: number }>;
    outOfStock: string[];
  };
  charts: {
    topSkus: Array<{ namaBarang: string; qty: number }>;
    zoneDistribution: Array<{ zone: string; qty: number }>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inventory: any[];
}

/**
 * Fetches dashboard data once, then subscribes to the SSE stream (/api/dashboard/stream)
 * which pushes fresh data every 30 seconds. Falls back gracefully to polling if SSE fails.
 */
export function useDashboardStream() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const applyData = useCallback((json: DashboardData) => {
    setData(json);
    setLastUpdated(new Date());
    setError(null);
    setLoading(false);
  }, []);

  // Manual refresh pulls a single snapshot
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!res.ok) throw new Error('Gagal memuat data dashboard');
      const json = await res.json();
      applyData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
      setLoading(false);
    }
  }, [applyData]);

  useEffect(() => {
    refresh();

    // Subscribe to SSE
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/dashboard/stream');
      eventSourceRef.current = es;

      es.onopen = () => setConnected(true);
      es.onmessage = (event) => {
        try {
          const json = JSON.parse(event.data);
          applyData(json);
          setConnected(true);
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        setConnected(false);
        // EventSource auto-reconnects; nothing else needed
      };
    } catch {
      setConnected(false);
    }

    return () => {
      es?.close();
      eventSourceRef.current = null;
    };
  }, [applyData, refresh]);

  return { data, loading, error, connected, lastUpdated, refresh };
}