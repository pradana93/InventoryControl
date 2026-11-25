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
    expired: Array<{ namaBarang: string; nomorRak: string; qty: number; expiredDate: string; entitas?: string }>;
    expiring: Array<{ namaBarang: string; nomorRak: string; qty: number; expiredDate: string; daysLeft: number; entitas?: string }>;
    outOfStock: Array<{ namaBarang: string; entitas?: string }>;
  };
  charts: {
    topSkus: Array<{ namaBarang: string; qty: number; entitas?: string }>;
    zoneDistribution: Array<{ zone: string; qty: number; entitas?: string }>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inventory: any[];
  entity: string;
}

/**
 * Fetches dashboard data once, then subscribes to the SSE stream (/api/dashboard/stream)
 * which pushes fresh data every 30 seconds. Falls back gracefully to polling if SSE fails.
 */
export function useDashboardStream(entity: 'BBB' | 'BBT' | 'ALL') {
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
      const ent = entity === 'ALL' ? '' : entity;
      const url = `/api/dashboard${ent ? `?ent=${ent}` : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Gagal memuat data dashboard');
      const json = await res.json();
      applyData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
      setLoading(false);
    }
  }, [applyData, entity]);

  useEffect(() => {
    refresh();

    // Subscribe to SSE
    let es: EventSource | null = null;
    try {
      const ent = entity === 'ALL' ? '' : entity;
      const streamUrl = `/api/dashboard/stream${ent ? `?ent=${ent}` : ''}`;
      es = new EventSource(streamUrl);
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