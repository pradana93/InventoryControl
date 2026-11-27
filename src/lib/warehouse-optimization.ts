
/**
 * Pure function to filter items that have `activeFlag` set to `true` or not present.
 * Items with `activeFlag: false` will be excluded.
 *
 * @template T - The type of the items, which may have an optional `activeFlag` property.
 * @param {T[]} items - The array of items to filter.
 * @returns {T[]} - A new array containing only the items where `activeFlag` is true or undefined.
 */
export function filterActiveSkus<T extends { activeFlag?: boolean }>(items: T[]): T[] {
  return items.filter(item => item.activeFlag !== false);
}

/**
 * Filters items based on their `activeFlag` and an optional entity filter.
 * Treats missing `activeFlag` as `true`.
 *
 * @template T - The type of the items, must have `activeFlag` and `entitas` properties.
 * @param {T[]} items - The array of items to filter.
 * @param {'BBB' | 'BBT' | 'ALL'} [entityFilter] - The entity to filter by. Defaults to 'ALL'.
 * @returns {T[]} - A new array containing only the active items matching the entity filter.
 */
export function filterActiveSkusByEntity<T extends { activeFlag?: boolean; entitas: string }>(
  items: T[],
  entityFilter: 'BBB' | 'BBT' | 'ALL' = 'ALL'
): T[] {
  return items.filter(item => {
    const isActive = item.activeFlag !== false;
    const matchesEntity = entityFilter === 'ALL' || item.entitas.toUpperCase() === entityFilter;
    return isActive && matchesEntity;
  });
}
