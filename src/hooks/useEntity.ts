'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Entity, ENTITY_COLORS, ENTITY_OPTIONS } from '@/lib/constants';

export function useEntity(): {
  entity: Entity;
  setEntity: (e: Entity) => void;
  badge: { bg: string; text: string; border: string; badge: string };
  options: typeof ENTITY_OPTIONS;
} {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [entity, setEntityState] = useState<Entity>('BBB');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const ent = searchParams.get('ent')?.toUpperCase();
    if (ent === 'BBB' || ent === 'BBT' || ent === 'ALL') {
      setEntityState(ent);
    } else {
      // Default from localStorage or BBB
      const saved = localStorage.getItem('selectedEntity') as Entity | null;
      setEntityState(saved || 'BBB');
    }
  }, [searchParams]);

  const setEntity = (newEntity: Entity) => {
    setEntityState(newEntity);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedEntity', newEntity);
    }
    const params = new URLSearchParams(searchParams.toString());
    if (newEntity === 'ALL') {
      params.delete('ent');
    } else {
      params.set('ent', newEntity);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Return badge config and options for dropdown
  return {
    entity,
    setEntity,
    badge: ENTITY_COLORS[entity],
    options: ENTITY_OPTIONS,
  };
}