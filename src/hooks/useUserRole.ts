'use client';

import { useSession } from 'next-auth/react';

export function useUserRole() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  return { role, status };
}