import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SessionsService } from './sessions.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SessionStatus, DiscountType, PaymentMode } from '@prisma/client';

describe('SessionsService (Salon Customer Workflow)', () => {
  let service: SessionsService;
  let prisma: {
    branch: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    customer: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    branchServicePricing: {
      findMany: ReturnType<typeof vi.fn>;
    };
    session: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    sessionService: {
      createMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    sessionProduct: {
      createMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  const mockReqUser = {
    sub: 'cred-123',
    branchId: 'b-branch-1',
    role: 'STYLIST',
    type: 'branch_auth',
  };

  const mockBranch = {
    id: 'b-branch-1',
    name: 'Main Salon',
    code: 'MS01',
    isActive: true,
  };

  const mockStylist = {
    id: 'u-stylist-1',
    name: 'Rahul Stylist',
    branchId: 'b-branch-1',
    isActive: true,
    role: { id: 'r-stylist', name: 'STYLIST' },
  };

  const mockOtherBranchStylist = {
    id: 'u-stylist-2',
    name: 'Other Stylist',
    branchId: 'b-branch-2',
    isActive: true,
    role: { id: 'r-stylist', name: 'STYLIST' },
  };

  const mockCustomer = {
    id: 'c-cust-1',
    name: 'Amit Verma',
    phone: '9876543210',
    qualifyingCompletedSessionsCount: 5,
    rewardEarned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMenuPricing = {
    id: 'sp-1',
    branchId: 'b-branch-1',
    serviceId: 's-1',
    price: 500.0,
    isActive: true,
    service: { id: 's-1', name: 'Haircut', isActive: true },
  };

  beforeEach(() => {
    prisma = {
      branch: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      customer: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      branchServicePricing: {
        findMany: vi.fn(),
      },
      session: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      sessionService: {
        createMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      sessionProduct: {
        createMany: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(prisma)),
    };

    service = new SessionsService(prisma as unknown as PrismaService);
  });

  describe('services chosen at check-in', () => {
    const pricing = (id: string, name: string, price: number) => ({
      id,
      price,
      service: { name },
    });
    const sessionRow = (services: unknown[] = []) => ({
      id: 'session-9',
      branchId: mockBranch.id,
      branch: mockBranch,
      stylist: null,
      customer: null,
      customerName: 'Rahul',
      customerMobile: null,
      status: SessionStatus.ACTIVE,
      subtotal: 0,
      discountType: DiscountType.NONE,
      discountValue: 0,
      discountAmount: 0,
      tipAmount: 0,
      totalAmount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      services,
      products: [],
    });

    it('stores the picked services (with price snapshots) on the new session', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.branchServicePricing.findMany.mockResolvedValue([
        pricing('11111111-1111-4111-8111-111111111111', 'Haircut', 300),
        pricing('22222222-2222-4222-8222-222222222222', 'Beard', 150),
      ]);
      prisma.session.create.mockResolvedValue(sessionRow());

      await service.createSession(mockReqUser, {
        customerName: 'Rahul',
        serviceIds: [
          '22222222-2222-4222-8222-222222222222',
          '11111111-1111-4111-8111-111111111111',
        ],
      });

      const data = prisma.session.create.mock.calls[0][0].data;
      expect(data.services.create).toEqual([
        { servicePricingId: '22222222-2222-4222-8222-222222222222', serviceName: 'Beard', price: 150 },
        { servicePricingId: '11111111-1111-4111-8111-111111111111', serviceName: 'Haircut', price: 300 },
      ]);
    });

    it('rejects services that are not on this branch menu', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.branchServicePricing.findMany.mockResolvedValue([]);
      await expect(
        service.createSession(mockReqUser, {
          customerName: 'Rahul',
          serviceIds: ['11111111-1111-4111-8111-111111111111'],
        }),
      ).rejects.toThrow(/invalid, inactive, or not on your branch menu/);
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('starts the service timer in the same request when startNow is set', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.session.create.mockResolvedValue(sessionRow());
      await service.createSession(mockReqUser, { customerName: 'Rahul', startNow: true });
      expect(prisma.session.create.mock.calls[0][0].data.startedAt).toBeInstanceOf(Date);
    });

    it('does not start the timer unless asked', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.session.create.mockResolvedValue(sessionRow());
      await service.createSession(mockReqUser, { customerName: 'Rahul' });
      expect(prisma.session.create.mock.calls[0][0].data.startedAt).toBeUndefined();
    });

    it('does not re-query relations it already has (create only loads the new services)', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.session.create.mockResolvedValue(sessionRow());
      await service.createSession(mockReqUser, { customerName: 'Rahul' });
      expect(prisma.session.create.mock.calls[0][0].include).toEqual({ services: true });
    });

    it('creates a plain session when no services were picked', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.session.create.mockResolvedValue(sessionRow());
      await service.createSession(mockReqUser, { customerName: 'Rahul' });
      expect(prisma.session.create.mock.calls[0][0].data.services).toBeUndefined();
      expect(prisma.branchServicePricing.findMany).not.toHaveBeenCalled();
    });
  });

  describe('createSession & Customer Workflow', () => {
    it('1. Creates a customer session with phone number, normalizes phone, and links customer', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue(mockCustomer);
      prisma.session.findFirst.mockResolvedValue(null);

      const createdSessionMock = {
        id: 'session-1',
        branchId: mockBranch.id,
        branch: mockBranch,
        stylistId: null,
        stylist: null,
        customerId: mockCustomer.id,
        customer: mockCustomer,
        customerName: 'Amit Verma',
        customerMobile: '9876543210',
        status: SessionStatus.ACTIVE,
        subtotal: 0,
        discountType: DiscountType.NONE,
        discountValue: 0,
        discountAmount: 0,
        tipAmount: 0,
        totalAmount: 0,
        paymentMode: null,
        startedAt: null,
        closedAt: null,
        isLoyaltyCounted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        services: [],
        products: [],
      };

      prisma.session.create.mockResolvedValue(createdSessionMock);

      const dto = {
        customerName: 'Amit Verma',
        customerMobile: '+91 98765-43210',
      };

      const result = await service.createSession(mockReqUser, dto);

      expect(result.message).toBe('Customer session created successfully');
      expect(result.session?.customerMobile).toBe('9876543210');
      expect(result.session?.customerId).toBe(mockCustomer.id);
      expect(result.session?.stylistId).toBeNull();
    });

    it('2. Creates a guest session without customer record when no phone number is provided', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);

      const createdGuestSessionMock = {
        id: 'session-guest',
        branchId: mockBranch.id,
        branch: mockBranch,
        stylistId: null,
        stylist: null,
        customerId: null,
        customer: null,
        customerName: 'Guest Customer',
        customerMobile: null,
        status: SessionStatus.ACTIVE,
        subtotal: 0,
        discountType: DiscountType.NONE,
        discountValue: 0,
        discountAmount: 0,
        tipAmount: 0,
        totalAmount: 0,
        paymentMode: null,
        startedAt: null,
        closedAt: null,
        isLoyaltyCounted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        services: [],
        products: [],
      };

      prisma.session.create.mockResolvedValue(createdGuestSessionMock);

      const dto = { customerName: 'Guest Customer' };
      const result = await service.createSession(mockReqUser, dto);

      expect(result.session?.customerId).toBeNull();
      expect(result.session?.customerMobile).toBeNull();
      expect(prisma.customer.findUnique).not.toHaveBeenCalled();
    });

    it('3. Rejects session creation if branch context is invalid or inactive', async () => {
      prisma.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.createSession({ branchId: 'invalid-branch' }, { customerName: 'Test' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listEligibleStylists', () => {
    it('4. Lists active stylists for the branch', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.user.findMany.mockResolvedValue([mockStylist]);

      const result = await service.listEligibleStylists(mockReqUser);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(mockStylist.id);
    });
  });

  describe('assignStylist', () => {
    it('5. Successfully assigns an active branch stylist to a session', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        branchId: mockBranch.id,
        status: SessionStatus.ACTIVE,
      });

      prisma.user.findUnique.mockResolvedValue(mockStylist);
      prisma.session.update.mockResolvedValue({
        id: 'session-1',
        branchId: mockBranch.id,
        stylistId: mockStylist.id,
        stylist: mockStylist,
        status: SessionStatus.ACTIVE,
      });

      const result = await service.assignStylist(mockReqUser, 'session-1', {
        stylistId: mockStylist.id,
      });

      expect(result.message).toBe('Stylist assigned to session successfully');
      expect(result.session?.stylistId).toBe(mockStylist.id);
    });

    it('6. Rejects assignment of stylist belonging to a different branch', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        branchId: mockBranch.id,
        status: SessionStatus.ACTIVE,
      });

      prisma.user.findUnique.mockResolvedValue(mockOtherBranchStylist);

      await expect(
        service.assignStylist(mockReqUser, 'session-1', {
          stylistId: mockOtherBranchStylist.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('startService', () => {
    it('7. Sets authoritative startedAt backend timestamp when service begins', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      const activeSession = {
        id: 'session-1',
        branchId: mockBranch.id,
        status: SessionStatus.ACTIVE,
        startedAt: null,
      };
      prisma.session.findUnique.mockResolvedValue(activeSession);

      const startTime = new Date();
      prisma.session.update.mockResolvedValue({
        ...activeSession,
        startedAt: startTime,
      });

      const result = await service.startService(mockReqUser, 'session-1');

      expect(result.message).toBe('Service started successfully');
      expect(result.session?.startedAt).toEqual(startTime);
    });
  });

  describe('closeSession, Idempotency & Loyalty Tracking', () => {
    it('8. Closes session, calculates duration, and increments customer loyalty count to 6th milestone (earning reward)', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      const activeSession = {
        id: 'session-1',
        branchId: mockBranch.id,
        customerId: mockCustomer.id,
        customer: mockCustomer,
        status: SessionStatus.ACTIVE,
        startedAt: new Date(Date.now() - 30 * 60000), // 30 mins ago
        isLoyaltyCounted: false,
        services: [],
        products: [],
      };

      prisma.session.findUnique
        .mockResolvedValueOnce(activeSession)
        .mockResolvedValueOnce({
          ...activeSession,
          status: SessionStatus.COMPLETED,
          subtotal: 500,
          discountType: DiscountType.NONE,
          discountAmount: 0,
          tipAmount: 0,
          totalAmount: 500,
          paymentMode: PaymentMode.CASH,
          closedAt: new Date(),
          isLoyaltyCounted: true,
          customer: {
            ...mockCustomer,
            qualifyingCompletedSessionsCount: 6,
            rewardEarned: true,
          },
        });

      prisma.branchServicePricing.findMany.mockResolvedValue([mockMenuPricing]);
      prisma.customer.findUnique.mockResolvedValue(mockCustomer);

      const dto = {
        services: [{ servicePricingId: 'sp-1' }],
        paymentMode: PaymentMode.CASH,
      };

      const result = await service.closeSession(mockReqUser, 'session-1', dto);

      expect(result.message).toBe('Session closed and billed successfully');
      expect(result.session?.status).toBe('COMPLETED');
      expect(result.session?.customer?.qualifyingCompletedSessionsCount).toBe(6);
      expect(result.session?.customer?.rewardEarned).toBe(true);
      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            qualifyingCompletedSessionsCount: 6,
            rewardEarned: true,
          }),
        }),
      );
    });

    it('9. Idempotency: Retrying closeSession on COMPLETED session returns billed session without re-incrementing loyalty count', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      const completedSessionMock = {
        id: 'session-1',
        branchId: mockBranch.id,
        status: SessionStatus.COMPLETED,
        subtotal: 500,
        discountType: DiscountType.NONE,
        discountAmount: 0,
        tipAmount: 0,
        totalAmount: 500,
        paymentMode: PaymentMode.CASH,
        closedAt: new Date(),
        isLoyaltyCounted: true,
        services: [],
        products: [],
      };

      prisma.session.findUnique.mockResolvedValue(completedSessionMock);

      const dto = {
        services: [{ servicePricingId: 'sp-1' }],
        paymentMode: PaymentMode.CASH,
      };

      const result = await service.closeSession(mockReqUser, 'session-1', dto);

      expect(result.message).toBe('Session is already closed and billed');
      expect(prisma.session.update).not.toHaveBeenCalled();
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
  });
});
