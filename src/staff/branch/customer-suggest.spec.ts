import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BranchOpsService } from './branch.service.js';
import { capitalizeName, maskPhone, normalizeName } from '../../common/customer-match.js';

describe('masking a number', () => {
  it('shows the first two and last three digits, and stars in between', () => {
    expect(maskPhone('9845012345')).toBe('98*****345');
    expect(maskPhone('6000000001')).toBe('60*****001');
  });
  it('gives nothing for anything that is not a 10-digit number', () => {
    for (const p of ['', '12345', '98450123456', '98450x2345', '+919845012345']) expect(maskPhone(p), p).toBeNull();
  });
});

describe('names', () => {
  it('start every word with a capital and leave the other letters as typed', () => {
    expect(capitalizeName('ravi kumar')).toBe('Ravi Kumar');
    expect(capitalizeName('ravi')).toBe('Ravi');
    expect(capitalizeName('mary-ann o\'neil')).toBe('Mary-ann O\'neil');
    expect(capitalizeName('de Souza')).toBe('De Souza');
    expect(capitalizeName('ಅರ್ಜುನ್ kumar')).toBe('ಅರ್ಜುನ್ Kumar');
    expect(capitalizeName('')).toBe('');
  });
  it('compare without extra spaces', () => {
    expect(normalizeName('  ravi    kumar ')).toBe('ravi kumar');
  });
});

describe('suggesting customers by name while the number is typed', () => {
  let prisma: any;
  let service: BranchOpsService;
  const row = (id: string, phone: string, visits = 1) => ({ id, phone, qualifyingCompletedSessionsCount: visits });

  beforeEach(() => {
    prisma = { customer: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() } };
    service = new BranchOpsService(prisma, {} as any);
  });

  it('matches the exact name ignoring capitals, and returns only an id and the masked number', async () => {
    prisma.customer.findMany.mockResolvedValue([row('c1', '9845012345', 7), row('c2', '7012345678', 2)]);
    const res = await service.suggestCustomers('  ravi   kumar ', '');
    expect(prisma.customer.findMany.mock.calls[0][0].where).toEqual({ name: { equals: 'ravi kumar', mode: 'insensitive' } });
    expect(res.data).toEqual([
      { id: 'c1', maskedPhone: '98*****345', visits: 7 },
      { id: 'c2', maskedPhone: '70*****678', visits: 2 },
    ]);
    // the full number is nowhere in the answer
    expect(JSON.stringify(res)).not.toContain('9845012345');
    expect(JSON.stringify(res)).not.toContain('7012345678');
  });

  it('narrows to numbers that start with the digits typed', async () => {
    await service.suggestCustomers('Ravi', '984');
    expect(prisma.customer.findMany.mock.calls[0][0].where).toEqual({ name: { equals: 'Ravi', mode: 'insensitive' }, phone: { startsWith: '984' } });
  });

  it('shows at most eight, and says there are more', async () => {
    prisma.customer.findMany.mockResolvedValue(Array.from({ length: 9 }, (_, i) => row(`c${i}`, `98450123${String(i).padStart(2, '0')}`)));
    const res = await service.suggestCustomers('Ravi', '');
    expect(res.data).toHaveLength(8);
    expect(res.more).toBe(true);
  });

  it('suggests nothing for a name that is too short, and skips a number that cannot be masked', async () => {
    expect((await service.suggestCustomers('R', '')).data).toEqual([]);
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
    prisma.customer.findMany.mockResolvedValue([row('c1', '12345')]);
    expect((await service.suggestCustomers('Ravi', '')).data).toEqual([]);
  });

  it('looks a picked customer up by id for the loyalty line (and a number the old way)', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', name: 'Ravi', phone: '9845012345', qualifyingCompletedSessionsCount: 5 });
    const byId = await service.lookupCustomer({ customerId: 'c1' });
    expect(prisma.customer.findUnique).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(byId).toMatchObject({ found: true, name: 'Ravi', rewardReady: true });
    await service.lookupCustomer({ phone: '+91 98450 12345' });
    expect(prisma.customer.findUnique).toHaveBeenLastCalledWith({ where: { phone: '9845012345' } });
  });
});
