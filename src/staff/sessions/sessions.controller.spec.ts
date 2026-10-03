import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { PaymentMode } from '@prisma/client';

describe('SessionsController (Salon Customer Workflow)', () => {
  let controller: SessionsController;
  let service: {
    createSession: ReturnType<typeof vi.fn>;
    listEligibleStylists: ReturnType<typeof vi.fn>;
    getActiveSessions: ReturnType<typeof vi.fn>;
    getSessionById: ReturnType<typeof vi.fn>;
    assignStylist: ReturnType<typeof vi.fn>;
    startService: ReturnType<typeof vi.fn>;
    closeSession: ReturnType<typeof vi.fn>;
  };

  const mockReq = {
    user: {
      sub: 'cred-123',
      branchId: 'b-branch-1',
      role: 'STYLIST',
      type: 'branch_auth',
    },
  };

  beforeEach(() => {
    service = {
      createSession: vi.fn(),
      listEligibleStylists: vi.fn(),
      getActiveSessions: vi.fn(),
      getSessionById: vi.fn(),
      assignStylist: vi.fn(),
      startService: vi.fn(),
      closeSession: vi.fn(),
    };

    controller = new SessionsController(service as unknown as SessionsService);
  });

  describe('createSession', () => {
    it('delegates createSession to service with req.user and dto', async () => {
      const mockResult = { message: 'Created', session: { id: 's-1' } };
      service.createSession.mockResolvedValue(mockResult);

      const dto = { customerName: 'Rahul' };
      const result = await controller.createSession(dto, mockReq);

      expect(service.createSession).toHaveBeenCalledWith(mockReq.user, dto);
      expect(result).toEqual(mockResult);
    });
  });

  describe('listEligibleStylists', () => {
    it('delegates listEligibleStylists to service with req.user', async () => {
      const mockResult = { data: [{ id: 'u-1', name: 'Stylist' }] };
      service.listEligibleStylists.mockResolvedValue(mockResult);

      const result = await controller.listEligibleStylists(mockReq);

      expect(service.listEligibleStylists).toHaveBeenCalledWith(mockReq.user);
      expect(result).toEqual(mockResult);
    });
  });

  describe('assignStylist', () => {
    it('delegates assignStylist to service with req.user, id, and dto', async () => {
      const mockResult = { message: 'Assigned', session: { id: 's-1', stylistId: 'u-1' } };
      service.assignStylist.mockResolvedValue(mockResult);

      const dto = { stylistId: 'u-1' };
      const result = await controller.assignStylist('s-1', dto, mockReq);

      expect(service.assignStylist).toHaveBeenCalledWith(mockReq.user, 's-1', dto);
      expect(result).toEqual(mockResult);
    });
  });

  describe('startService', () => {
    it('delegates startService to service with req.user and id', async () => {
      const mockResult = { message: 'Started', session: { id: 's-1' } };
      service.startService.mockResolvedValue(mockResult);

      const result = await controller.startService('s-1', mockReq);

      expect(service.startService).toHaveBeenCalledWith(mockReq.user, 's-1');
      expect(result).toEqual(mockResult);
    });
  });

  describe('closeSession', () => {
    it('delegates closeSession to service with req.user, id, and dto', async () => {
      const mockResult = { message: 'Closed', session: { id: 's-1' } };
      service.closeSession.mockResolvedValue(mockResult);

      const dto = {
        services: [{ servicePricingId: 'sp-1' }],
        paymentMode: PaymentMode.CASH,
      };

      const result = await controller.closeSession('s-1', dto, mockReq);

      expect(service.closeSession).toHaveBeenCalledWith(mockReq.user, 's-1', dto);
      expect(result).toEqual(mockResult);
    });
  });
});
