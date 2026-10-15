/**
 * The order services appear in everywhere (billing menu and Admin → Menu pricing):
 * Hair, then Beard, then Skin, then Combo, then anything else (alphabetically by category, no category last).
 * Inside a category the order is the order they were added in, so editing or renaming a service never moves it.
 */
export const CATEGORY_ORDER = ['Hair', 'Beard', 'Skin', 'Combo'] as const;

/**
 * A guess at a service's category from its name, for services that were added without one (so the admin never has
 * to pick a category): "Beard Spa" is Beard, "Brightening Facial" is Skin, "The Basic (Haircut + …)" is a Combo.
 */
export function inferCategory(name: string): string | null {
  const n = name.toLowerCase();
  if (/\(|combo|package|\bthe \w+/.test(n)) return 'Combo';
  if (/beard|moustache|mustache|shave/.test(n)) return 'Beard';
  if (/facial|clean-?up|de-?tan|skin|bleach|wax|scrub|face/.test(n)) return 'Skin';
  if (/hair|head|colour|color|spa|massage|straighten|smooth|perm|styl/.test(n)) return 'Hair';
  return null;
}

/** The category used for ordering: the stored one, or a guess from the name when there is none. */
export const effectiveCategory = (service: { name: string; category: string | null }): string | null =>
  service.category && service.category.trim() ? service.category : inferCategory(service.name);

const rankOf = (category: string | null | undefined): number => {
  const c = (category ?? '').trim().toLowerCase();
  const i = CATEGORY_ORDER.findIndex((x) => x.toLowerCase() === c);
  return i >= 0 ? i : CATEGORY_ORDER.length;
};

interface Orderable {
  createdAt: Date | string;
  id?: string;
  service: { name: string; category: string | null };
}

export function compareMenu(a: Orderable, b: Orderable): number {
  const ca0 = effectiveCategory(a.service);
  const cb0 = effectiveCategory(b.service);
  const ra = rankOf(ca0);
  const rb = rankOf(cb0);
  if (ra !== rb) return ra - rb;
  // both "other": group by category name, services with no category after those
  if (ra === CATEGORY_ORDER.length) {
    const ca = (ca0 ?? '').trim().toLowerCase();
    const cb = (cb0 ?? '').trim().toLowerCase();
    if (ca !== cb) return ca === '' ? 1 : cb === '' ? -1 : ca.localeCompare(cb);
  }
  const t = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (t !== 0) return t;
  return (a.id ?? a.service.name).localeCompare(b.id ?? b.service.name);
}

export const sortMenu = <T extends Orderable>(rows: T[]): T[] => [...rows].sort(compareMenu);
