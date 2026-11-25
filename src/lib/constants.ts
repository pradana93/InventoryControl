export type Entity = 'BBB' | 'BBT' | 'ALL';

export const ENTITY_OPTIONS: { value: Entity; label: string; short: string }[] = [
  { value: 'BBB', label: 'BBB (PT Bangor Berkembang Bersama)', short: 'BBB' },
  { value: 'BBT', label: 'BBT (PT Bangor Berani Terukur)', short: 'BBT' },
  { value: 'ALL', label: 'Semua Entitas', short: 'All' },
];

export const ENTITY_COLORS: Record<Entity, { bg: string; text: string; border: string; badge: string }> = {
  BBB: { bg: 'bg-amber-500/20', text: 'text-amber-700', border: 'border-amber-300', badge: 'bg-amber-100 text-amber-800' },
  BBT: { bg: 'bg-sky-500/20', text: 'text-sky-700', border: 'border-sky-300', badge: 'bg-sky-100 text-sky-800' },
  ALL: { bg: 'bg-purple-500/20', text: 'text-purple-700', border: 'border-purple-300', badge: 'bg-purple-100 text-purple-800' },
};

export const PT_PATTERNS: Record<'BBB' | 'BBT', string[]> = {
  BBB: ['PT BANGOR BERKEMBANG BERSAMA', 'BERKEMBANG BERSAMA', 'PT BBB'],
  BBT: ['PT BANGOR BERANI TERUKUR', 'BERANI TERUKUR', 'PT BBT'],
};