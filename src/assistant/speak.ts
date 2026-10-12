/** Words for numbers that sound right out loud, in the way people in India say them. */

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** 12400 → "12,400 rupees", 125000 → "1.25 lakh rupees", 15000000 → "1.5 crore rupees". */
export function sayMoney(n: number): string {
  const v = Math.abs(n);
  const sign = n < 0 ? 'minus ' : '';
  if (v >= 1e7) return `${sign}${round(v / 1e7, 2)} crore rupees`;
  if (v >= 1e5) return `${sign}${round(v / 1e5, 2)} lakh rupees`;
  if (v >= 1000) return `${sign}${Math.round(v).toLocaleString('en-IN')} rupees`;
  return `${sign}${Number.isInteger(round(v, 2)) ? round(v, 0) : round(v, 2)} rupees`;
}

/** "₹12,400" / "₹1,24,000" / "₹950.50" (Indian grouping; whole rupees when there are no paise). */
export function showMoney(n: number): string {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  const text = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : ''}₹${text}`;
}

export const sayPercent = (p: number) => `${Math.abs(Math.round(p))} percent`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "CAVE Karkala" → "Karkala"; "KARKALA" → "Karkala" (so a voice reads it as a word, not letter by letter). */
export function niceName(name: string): string {
  const base = name.replace(/^CAVE\s+/i, '').trim();
  const words = base.split(/\s+/).map((w) => (w.length > 3 && w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w));
  return words.join(' ');
}
