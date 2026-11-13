import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SessionsService } from './sessions.service.js';

describe('starting a session for a customer picked from the suggestions', () => {
  const reqUser = { branchId: 'b1', role: 'MANAGER' };
  let prisma: any;
  let service: SessionsService;
  const customer = { id: 'c1', name: 'Ravi Kumar', phone: '9845012345', qualifyingCompletedSessionsCount: 3 };

  beforeEach(() => {
    prisma = {
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'B', isActive: true }) },
      customer: { findUnique: vi.fn(async ({ where }: any) => (where.id === 'c1' || where.phone === '9845012345' ? customer : null)), update: vi.fn(), create: vi.fn() },
      session: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(async ({ data }: any) => ({ id: 's1', createdAt: new Date(), updatedAt: new Date(), services: [], ...data })) },
      user: { findUnique: vi.fn() },
      branchServicePricing: { findMany: vi.fn().mockResolvedValue([]) },
    };
    service = new SessionsService(prisma);
  });

  it('uses the saved name and number, whatever was typed or sent alongside', async () => {
    await service.createSession(reqUser, { customerId: 'c1', customerName: 'ravi', customerMobile: '9000000000' } as any);
    expect(prisma.session.create.mock.calls[0][0].data).toMatchObject({ customerId: 'c1', customerName: 'Ravi Kumar', customerMobile: '9845012345' });
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled(); // the customer is not renamed by what was typed
  });

  it('refuses an id that is not a customer, instead of making a new one', async () => {
    await expect(service.createSession(reqUser, { customerId: 'nope', customerName: 'Ravi' } as any)).rejects.toThrow(BadRequestException);
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('still works with a typed number and no pick', async () => {
    await service.createSession(reqUser, { customerName: 'Ravi Kumar', customerMobile: '9845012345' } as any);
    expect(prisma.session.create.mock.calls[0][0].data).toMatchObject({ customerId: 'c1', customerMobile: '9845012345' });
  });
});
