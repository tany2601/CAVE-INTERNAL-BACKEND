import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { billNumber, groupLines, inr, isWalkInName, priceLabel, withQty } from './whatsapp.format.js';

/** Where fonts and the logo live: <backend>/assets, reachable from both src/ and dist/. */
const ASSETS = fileURLToPath(new URL('../../assets/', import.meta.url));
const FONT_FILES = [
  'Barlow-Regular.ttf',
  'Barlow-Medium.ttf',
  'Barlow-SemiBold.ttf',
  'BarlowCondensed-Bold.ttf',
  'BarlowCondensed-ExtraBold.ttf',
  // Barlow has no ₹ glyph; DM Sans (latin-ext subset) supplies it as a fallback.
  'DMSansRupee-Regular.ttf',
  'DMSansRupee-SemiBold.ttf',
].map((f) => `${ASSETS}fonts/${f}`);

let logoUri: string | null = null;
const logo = () => (logoUri ??= `data:image/png;base64,${readFileSync(`${ASSETS}cave-logo.png`).toString('base64')}`);

export interface BillImageData {
  id: string;
  customerName: string;
  branchName: string;
  paymentMode: string | null;
  closedAt: Date | null;
  discountAmount: number;
  tipAmount: number;
  totalAmount: number;
  services: { name: string; price: number }[];
  products: { name: string; price: number }[];
  /** Total visits after this bill, for the loyalty line. Left out for customers we don't know. */
  loyalty?: { visits: number; target?: number };
}

const W = 1080;
const PAD = 72;
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy word wrap using an average glyph width; good enough for Barlow at these sizes. */
export function wrapText(text: string, fontSize: number, maxWidth: number, em = 0.5): string[] {
  const perLine = Math.max(8, Math.floor(maxWidth / (fontSize * em)));
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > perLine && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** "Combo (what is inside)" -> the name and its contents, so long combos stay readable. */
const splitName = (name: string) => {
  const open = name.indexOf(' (');
  return open > 0 && name.endsWith(')')
    ? { title: name.slice(0, open), detail: name.slice(open + 2, -1) }
    : { title: name, detail: '' };
};

const when = (d: Date | null) =>
  (d ?? new Date()).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 21st */
export const ordinal = (n: number): string => {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
};

export const LOYALTY_TARGET = 6;

/**
 * The line that makes a customer want to come back. Visits 1 to 5 are paid and the 6th haircut is free,
 * so this says how far along the card they are. `visits` is their total after this bill.
 */
export function loyaltyCopy(visits: number, target = LOYALTY_TARGET): { title: string; sub: string; filled: number } {
  const into = visits % target; // paid visits done in this round
  if (visits > 0 && into === 0) {
    return { title: 'That visit was on us!', sub: `Visit #${visits} earned a free haircut. A fresh card starts now.`, filled: target };
  }
  const paidLeft = target - 1 - into; // paid visits still to go before the free one
  if (paidLeft === 0) {
    return { title: 'Your next haircut is FREE!', sub: `Visit #${visits} done. Your ${ordinal(target)} visit is on us. Book it soon.`, filled: into };
  }
  if (visits === 1) {
    return { title: 'Welcome to the CAVE family!', sub: `Visit #1 done. ${paidLeft} more, then your haircut is on us.`, filled: into };
  }
  return {
    title: `${paidLeft} more visit${paidLeft === 1 ? '' : 's'}, then a free haircut!`,
    sub: `That was your ${ordinal(visits)} visit. Keep it going.`,
    filled: into,
  };
}

/** The bill as a branded picture: gradient background, glass panels, every line, the total and a loyalty nudge. */
export function renderBillSvg(b: BillImageData): { svg: string; height: number } {
  const parts: string[] = [];
  let y = 0;
  const text = (
    x: number,
    baseline: number,
    content: string,
    o: { size: number; family?: string; weight?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; spacing?: number },
    into: string[] = parts,
  ) =>
    into.push(
      `<text x="${x}" y="${baseline}" font-family="${o.family ?? 'Barlow'}" font-size="${o.size}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? '#F5F5F5'}" text-anchor="${o.anchor ?? 'start'}"${o.spacing ? ` letter-spacing="${o.spacing}"` : ''}>${esc(content)}</text>`,
    );
  const IN = PAD + 36; // text inset inside a glass panel
  const innerW = W - PAD * 2;
  const rule = (at: number) => parts.push(`<rect x="${IN}" y="${at}" width="${W - IN * 2}" height="2" fill="#FFFFFF" fill-opacity="0.12"/>`);
  /** A frosted-glass panel behind whatever was drawn since `from`. */
  const glass = (from: number, top: number, height: number) =>
    parts.splice(
      from,
      0,
      `<rect x="${PAD}" y="${top}" width="${innerW}" height="${height}" rx="44" fill="url(#glass)" stroke="url(#glassEdge)" stroke-width="2"/>`,
      `<rect x="${PAD + 40}" y="${top + 1}" width="${innerW - 80}" height="2" rx="1" fill="#FFFFFF" fill-opacity="0.35"/>`,
    );

  // Header
  parts.push(`<image href="${logo()}" x="${(W - 400) / 2}" y="84" width="400" height="104"/>`);
  text(W / 2, 236, "MEN'S SALON", { size: 26, fill: '#9A9AA6', anchor: 'middle', spacing: 10, weight: 500 });
  text(W / 2, 282, b.branchName.toUpperCase(), { size: 30, fill: '#CFCFD8', anchor: 'middle', spacing: 5, weight: 600 });

  // Greeting
  const first = isWalkInName(b.customerName) ? '' : (b.customerName.trim().split(/\s+/)[0] || '').slice(0, 24);
  y = 372;
  text(PAD, (y += 100), first ? `Thank you, ${first}!` : 'Thank you!', { size: 84, family: 'Barlow Condensed', weight: 800 });
  text(PAD, (y += 54), 'It was a pleasure having you with us.', { size: 34, fill: '#B4B4C0' });
  y += 56;

  // The bill (glass panel)
  const billTop = y;
  const billFrom = parts.length;
  y += 28;
  text(IN, (y += 30), 'YOUR BILL', { size: 24, fill: '#9A9AA6', spacing: 6, weight: 600 });
  y += 8;
  const row = (name: string, price: string) => {
    const { title, detail } = splitName(name);
    const titleLines = wrapText(title, 38, 620, 0.48);
    y += 30;
    titleLines.forEach((l, i) => text(IN, y + i * 46 + 30, l, { size: 38, weight: 500 }));
    text(W - IN, y + 30, price, { size: 38, weight: 600, anchor: 'end' });
    y += titleLines.length * 46;
    if (detail) {
      const dl = wrapText(detail, 28, 760, 0.5);
      dl.forEach((l, i) => text(IN, y + 24 + i * 36, l, { size: 28, fill: '#9A9AA6' }));
      y += dl.length * 36 + 4;
    }
    y += 10;
  };
  for (const s of groupLines(b.services)) row(withQty(s.name, s.qty), priceLabel(s.total));
  for (const p of groupLines(b.products)) row(withQty(p.name, p.qty), priceLabel(p.total));
  const extras = [
    ...(b.discountAmount > 0 ? [['Discount', `-${inr(b.discountAmount)}`, '#6FCF97'] as const] : []),
    ...(b.tipAmount > 0 ? [['Tip', inr(b.tipAmount), '#CFCFD8'] as const] : []),
  ];
  if (extras.length) {
    y += 6;
    rule(y);
    y += 6;
    for (const [label, value, fill] of extras) {
      y += 54;
      text(IN, y, label, { size: 34, fill });
      text(W - IN, y, value, { size: 34, fill, anchor: 'end', weight: 500 });
    }
  }
  y += 34;
  glass(billFrom, billTop, y - billTop);

  // Total
  y += 28;
  parts.push(
    `<rect x="${PAD}" y="${y}" width="${innerW}" height="132" rx="40" fill="url(#pill)"/>`,
    `<rect x="${PAD + 40}" y="${y + 1}" width="${innerW - 80}" height="2" rx="1" fill="#FFFFFF"/>`,
  );
  text(PAD + 44, y + 82, 'TOTAL PAID', { size: 32, fill: '#3A3A44', spacing: 5, weight: 600 });
  text(W - PAD - 44, y + 92, inr(b.totalAmount), { size: 84, family: 'Barlow Condensed', weight: 800, fill: '#0B0B10', anchor: 'end' });
  y += 132;

  // Loyalty (glass panel): only for customers we know, so product-only walk-ins don't get it
  if (b.loyalty && b.loyalty.visits > 0) {
    const copy = loyaltyCopy(b.loyalty.visits, b.loyalty.target ?? LOYALTY_TARGET);
    const target = b.loyalty.target ?? LOYALTY_TARGET;
    y += 28;
    const top = y;
    const from = parts.length;
    y += 28;
    text(IN, (y += 30), `YOUR ${ordinal(b.loyalty.visits).toUpperCase()} VISIT`, { size: 24, fill: '#E7C873', spacing: 6, weight: 600 });
    const lines = wrapText(copy.title, 52, innerW - 72, 0.42);
    lines.forEach((l, i) => text(IN, y + 66 + i * 58, l, { size: 52, family: 'Barlow Condensed', weight: 800 }));
    y += 66 + (lines.length - 1) * 58;
    const sub = wrapText(copy.sub, 30, innerW - 72, 0.5);
    sub.forEach((l, i) => text(IN, y + 48 + i * 40, l, { size: 30, fill: '#B4B4C0' }));
    y += 48 + (sub.length - 1) * 40;
    // progress dots: filled ones in gold, the last one is the free haircut
    y += 52;
    const gap = (innerW - 72 - target * 56) / (target - 1);
    for (let i = 0; i < target; i += 1) {
      const cx = IN + 28 + i * (56 + gap);
      const done = i < copy.filled;
      parts.push(
        `<circle cx="${cx}" cy="${y + 28}" r="26" fill="${done ? '#E7C873' : '#FFFFFF'}" fill-opacity="${done ? 1 : 0.07}" stroke="${done ? '#F6E2A5' : '#FFFFFF'}" stroke-opacity="${done ? 1 : 0.25}" stroke-width="2"/>`,
      );
      if (i === target - 1) {
        const pts = Array.from({ length: 10 }, (_, k) => {
          const r = k % 2 === 0 ? 15 : 6.5;
          const a = (Math.PI / 5) * k - Math.PI / 2;
          return `${(cx + r * Math.cos(a)).toFixed(1)},${(y + 28 + r * Math.sin(a)).toFixed(1)}`;
        }).join(' ');
        parts.push(`<polygon points="${pts}" fill="${done ? '#1A1405' : '#E7C873'}"/>`);
      } else {
        text(cx, y + 40, String(i + 1), { size: 30, weight: 600, anchor: 'middle', fill: done ? '#1A1405' : '#8A8A96' });
      }
    }
    y += 56 + 34;
    glass(from, top, y - top);
  }

  // Footer
  y += 60;
  text(W / 2, y, `Paid by ${b.paymentMode === 'GPAY' ? 'GPay' : 'Cash'}  ·  Bill no. ${billNumber(b.id)}`, { size: 30, fill: '#B4B4C0', anchor: 'middle', weight: 500 });
  text(W / 2, (y += 44), when(b.closedAt), { size: 28, fill: '#8A8A96', anchor: 'middle' });
  y += 76;
  text(W / 2, y, 'See you again soon.', { size: 56, family: 'Barlow Condensed', weight: 800, anchor: 'middle', fill: '#F5F5F5' });
  y += 84;

  const height = y;
  const defs = `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16161F"/><stop offset="0.5" stop-color="#0B0B10"/><stop offset="1" stop-color="#171722"/></linearGradient>
<radialGradient id="glowA" cx="0.12" cy="0.04" r="0.65"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.18"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
<radialGradient id="glowB" cx="0.95" cy="0.9" r="0.75"><stop offset="0" stop-color="#4C7FC0" stop-opacity="0.34"/><stop offset="1" stop-color="#4C7FC0" stop-opacity="0"/></radialGradient>
<radialGradient id="glowC" cx="0.9" cy="0.35" r="0.5"><stop offset="0" stop-color="#E7C873" stop-opacity="0.10"/><stop offset="1" stop-color="#E7C873" stop-opacity="0"/></radialGradient>
<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.13"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.045"/></linearGradient>
<linearGradient id="glassEdge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.42"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.10"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.22"/></linearGradient>
<linearGradient id="pill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D9DBE6"/></linearGradient>
</defs>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">${defs}<rect width="${W}" height="${height}" fill="url(#bg)"/><rect width="${W}" height="${height}" fill="url(#glowA)"/><rect width="${W}" height="${height}" fill="url(#glowC)"/><rect width="${W}" height="${height}" fill="url(#glowB)"/>${parts.join('')}</svg>`;
  return { svg, height };
}

export function renderBillPng(b: BillImageData): Buffer {
  const { svg } = renderBillSvg(b);
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Barlow' },
  })
    .render()
    .asPng();
}
