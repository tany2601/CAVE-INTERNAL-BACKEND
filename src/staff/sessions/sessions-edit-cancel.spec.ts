import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service.js';

describe('SessionsService · manager edit and cancel', () => {
  const reqUser = { branchId: 'b1', role: 'MANAGER' };
  let prisma: any;
  let tx: any;
  let service: SessionsService;

  beforeEach(() => {
    tx = {
      session: { update: vi.fn(), findUnique: vi.fn().mockResolvedValue({ id: 's1' }) },
      customer: { findUnique: vi.fn(), update: vi.fn() },
      sessionService: { deleteMany: vi.fn(), createMany: vi.fn() },
      sessionProduct: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    prisma = {
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'B', isActive: true }) },
      session: { findUnique: vi.fn() },
      branchServicePricing: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    service = new SessionsService(prisma);
  });

  describe('cancelSession', () => {
    it('404s for an unknown session', async () => {
      prisma.session.findUnique.mockResolvedValue(null);
      await expect(service.cancelSession(reqUser, 's1')).rejects.toThrow(NotFoundException);
    });

    it('blocks cancelling another branch\'s session', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'other', status: SessionStatus.COMPLETED });
      await expect(service.cancelSession(reqUser, 's1')).rejects.toThrow(ForbiddenException);
    });

    it('is idempotent once cancelled', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.CANCELLED });
      await service.cancelSession(reqUser, 's1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('voids the session and rolls back the loyalty credit', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 's1',
        branchId: 'b1',
        status: SessionStatus.COMPLETED,
        isLoyaltyCounted: true,
        customerId: 'c1',
      });
      tx.customer.findUnique.mockResolvedValue({ id: 'c1', qualifyingCompletedSessionsCount: 6 });

      await service.cancelSession(reqUser, 's1');

      expect(tx.session.update.mock.calls[0][0].data).toMatchObject({
        status: SessionStatus.CANCELLED,
        isLoyaltyCounted: false,
      });
      // 6 -> 5 visits: the 6th-visit reward flag no longer applies
      expect(tx.customer.update.mock.calls[0][0].data).toEqual({
        qualifyingCompletedSessionsCount: 5,
        rewardEarned: false,
      });
    });

    it('leaves loyalty alone for sessions that never counted', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 's1',
        branchId: 'b1',
        status: SessionStatus.COMPLETED,
        isLoyaltyCounted: false,
        customerId: 'c1',
      });
      await service.cancelSession(reqUser, 's1');
      expect(tx.customer.update).not.toHaveBeenCalled();
    });
  });

  describe('editSession', () => {
    it('only edits billed sessions', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.ACTIVE });
      await expect(
        service.editSession(reqUser, 's1', { paymentMode: 'CASH' } as any),
      ).rejects.toThrow(/Only billed sessions/);
    });

    it('requires at least one billable line', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.COMPLETED });
      await expect(
        service.editSession(reqUser, 's1', { paymentMode: 'CASH' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('replaces line items, recomputes totals and flags the session edited', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.COMPLETED });
      await service.editSession(reqUser, 's1', {
        customServices: [{ name: 'Special cut', price: 500 }],
        productSales: [{ productName: 'Clay', price: 100 }],
        discountType: 'PERCENTAGE',
        discountValue: 10,
        tipAmount: 20,
        paymentMode: 'GPAY',
      } as any);

      expect(tx.sessionService.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 's1' } });
      expect(tx.sessionProduct.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 's1' } });
      const data = tx.session.update.mock.calls[0][0].data;
      // 600 subtotal - 60 discount + 20 tip
      expect(data).toMatchObject({
        subtotal: 600,
        discountAmount: 60,
        tipAmount: 20,
        totalAmount: 560,
        paymentMode: 'GPAY',
        isEdited: true,
      });
    });
  });
});
