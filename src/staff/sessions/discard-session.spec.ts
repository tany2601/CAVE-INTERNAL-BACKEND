import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service.js';

describe('discarding a bill that was started and cancelled', () => {
  const stylist = { branchId: 'b1', role: 'STYLIST' };
  let prisma: any;
  let service: SessionsService;
  const open = (over: any = {}) =>
    prisma.session.findUnique.mockResolvedValue({
      id: 's1', branchId: 'b1', status: SessionStatus.ACTIVE, isLoyaltyCounted: false, createdAt: new Date(), ...over,
    });

  beforeEach(() => {
    prisma = {
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'B', isActive: true }) },
      session: { findUnique: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      customer: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    service = new SessionsService(prisma);
  });

  it('removes the session completely (a stylist can do it, not only a manager)', async () => {
    open();
    await service.discardSession(stylist, 's1');
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { id: 's1', status: SessionStatus.ACTIVE, isLoyaltyCounted: false } });
  });

  it('also removes a customer that was added only for this bill, never one who has other visits', async () => {
    open({ customerId: 'c1' });
    await service.discardSession(stylist, 's1');
    expect(prisma.customer.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1', sessions: { none: {} } } });
  });

  it('is fine when it is already gone', async () => {
    prisma.session.findUnique.mockResolvedValue(null);
    await expect(service.discardSession(stylist, 's1')).resolves.toMatchObject({ message: expect.any(String) });
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it("won't touch another branch's session, a billed one, or an old one", async () => {
    open({ branchId: 'other' });
    await expect(service.discardSession(stylist, 's1')).rejects.toThrow(ForbiddenException);
    for (const over of [{ status: SessionStatus.COMPLETED }, { isLoyaltyCounted: true }, { createdAt: new Date(Date.now() - 2 * 3600_000) }]) {
      open(over);
      await expect(service.discardSession(stylist, 's1')).rejects.toThrow(BadRequestException);
    }
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });
});
