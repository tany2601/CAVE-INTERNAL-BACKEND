import { describe, it, expect } from 'vitest';
import { renderBillPng, renderBillSvg, wrapText, BillImageData } from './bill-image.js';

const bill = (over: Partial<BillImageData> = {}): BillImageData => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-0123456789ab',
  customerName: 'Ravi Kumar',
  branchName: 'CAVE Karkala',
  paymentMode: 'GPAY',
  closedAt: new Date('2026-10-08T10:30:00Z'),
  discountAmount: 84.9,
  tipAmount: 50,
  totalAmount: 1014.1,
  services: [{ name: 'Haircut + Hair Wash & Style', price: 150 }],
  products: [{ name: 'Matte Clay', price: 599 }],
  ...over,
});

const size = (png: Buffer) => ({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) });

describe('bill picture', () => {
  it('renders a 1080px-wide PNG', () => {
    const png = renderBillPng(bill());
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(size(png).w).toBe(1080);
  });

  it('shows the stored figures: lines, discount, tip, total, payment mode, bill number and local time', () => {
    const { svg } = renderBillSvg(bill());
    for (const expected of ['Thank you, Ravi!', 'Haircut + Hair Wash &amp; Style', '₹150', '₹599', '-₹84.90', '₹50', '₹1,014.10', 'Paid by GPay', 'Bill no. 6789AB', '4:00 pm', 'CAVE KARKALA']) {
      expect(svg).toContain(expected);
    }
  });

  it('omits the discount and tip rows when there are none, and says Cash', () => {
    const { svg } = renderBillSvg(bill({ discountAmount: 0, tipAmount: 0, paymentMode: 'CASH', totalAmount: 749 }));
    expect(svg).not.toContain('Discount');
    expect(svg).not.toContain('>Tip<');
    expect(svg).toContain('Paid by Cash');
  });

  it('thanks a product-only sale without using its placeholder name', () => {
    const { svg } = renderBillSvg(bill({ customerName: 'Product sale', services: [] }));
    expect(svg).toContain('Thank you!');
    expect(svg).not.toContain('Product!');
  });

  it('escapes anything typed into names so it cannot break the picture', () => {
    const { svg } = renderBillSvg(bill({ customerName: '<script>x</script> "Q" & Co', services: [{ name: 'A < B & "C"', price: 1 }] }));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(() => renderBillPng(bill({ customerName: '<b>&"', services: [{ name: '<>&"\'', price: 1 }] }))).not.toThrow();
  });

  it('grows taller with more lines and wraps long combo names under their title', () => {
    const short = renderBillSvg(bill()).height;
    const many = renderBillSvg(
      bill({
        services: [
          { name: 'The Treatment (Haircut + Hair Wash & Style + Beard Trim + Hair Scalp Renewal + HydraFacial)', price: 3499 },
          ...Array.from({ length: 8 }, (_, i) => ({ name: `Service ${i}`, price: 100 })),
        ],
      }),
    );
    expect(many.height).toBeGreaterThan(short + 600);
    expect(many.svg).toContain('The Treatment');
    expect(many.svg).toContain('Renewal'); // the contents wrap onto lines, none are dropped
    expect(many.svg).toContain('HydraFacial');
    expect(size(renderBillPng(bill({ services: Array.from({ length: 30 }, (_, i) => ({ name: `Service ${i}`, price: 10 })) }))).h).toBeGreaterThan(2000);
  });

  it('wraps words without breaking them or losing any', () => {
    const lines = wrapText('Haircut + Hair Wash & Style + Beard Trim + De-Tan Treatment / Clean-up', 28, 400);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('Haircut + Hair Wash & Style + Beard Trim + De-Tan Treatment / Clean-up');
  });
});

describe('loyalty line', () => {
  it('counts down to the free haircut and celebrates the 6th visit', async () => {
    const { loyaltyCopy, ordinal } = await import('./bill-image.js');
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(23)).toBe('23rd');
    expect(loyaltyCopy(1).title).toMatch(/Welcome/);
    expect(loyaltyCopy(3)).toMatchObject({ title: '2 more visits, then a free haircut!', filled: 3 });
    expect(loyaltyCopy(4).title).toBe('1 more visit, then a free haircut!');
    expect(loyaltyCopy(5)).toMatchObject({ title: 'Your next haircut is FREE!', filled: 5 });
    expect(loyaltyCopy(6)).toMatchObject({ title: 'That visit was on us!', filled: 6 });
    expect(loyaltyCopy(8).filled).toBe(2);
  });

  it('shows the visit only when a customer is known', async () => {
    const { renderBillSvg } = await import('./bill-image.js');
    const base = { id: 'abcdef123456', customerName: 'Product sale', branchName: 'B', paymentMode: 'CASH', closedAt: new Date(), discountAmount: 0, tipAmount: 0, totalAmount: 100, services: [], products: [{ name: 'Wax', price: 100 }] } as any;
    expect(renderBillSvg(base).svg).not.toContain('VISIT');
    expect(renderBillSvg({ ...base, loyalty: { visits: 4 } }).svg).toContain('YOUR 4TH VISIT');
  });
});

describe('the same service several times on one bill', () => {
  it('shows one line with the quantity and the combined price (a customer paying for friends too)', () => {
    const { svg } = renderBillSvg(
      bill({
        services: [
          { name: 'Haircut', price: 150 },
          { name: 'Haircut', price: 150 },
          { name: 'Haircut', price: 150 },
          { name: 'Beard Trim', price: 100 },
        ],
        products: [],
        discountAmount: 0,
        tipAmount: 0,
        totalAmount: 550,
      }),
    );
    expect(svg).toContain('Haircut ×3');
    expect(svg).toContain('₹450');
    expect(svg.match(/Haircut/g)?.length).toBe(1);
    expect(svg).toContain('Beard Trim');
  });
});
