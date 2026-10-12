/** Every 6th visit has a free haircut: visits 1–5 are paid, the 6th is on the house. */
export const LOYALTY_TARGET = 6;

/** Is the visit that comes after `completedVisits` finished visits the free one? */
export const isFreeVisitNext = (completedVisits: number): boolean =>
  completedVisits >= 0 && completedVisits % LOYALTY_TARGET === LOYALTY_TARGET - 1;

/** "Haircut", "Haircut + Hair Wash & Style"; combo packages ("The Basic (Haircut + …)") are not a haircut. */
export const isHaircutName = (name: string): boolean => /^hair\s*cut\b/i.test(name.trim());

/**
 * Which line is the free haircut: the cheapest haircut (the first one when prices tie), or -1.
 * The app uses the same rule so the bill on screen is the bill that is saved.
 */
export function freeHaircutIndex(lines: { name: string; price: number }[]): number {
  let best = -1;
  lines.forEach((l, i) => {
    if (isHaircutName(l.name) && (best === -1 || l.price < lines[best].price)) best = i;
  });
  return best;
}
