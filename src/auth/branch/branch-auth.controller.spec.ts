import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { BranchAuthController } from './branch-auth.controller.js';
import { BranchAuthService } from './branch-auth.service.js';

describe('BranchAuthController', () => {
  let controller: BranchAuthController;
  let branchAuthService: {
    login: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    branchAuthService = {
      login: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BranchAuthController],
      providers: [
        { provide: BranchAuthService, useValue: branchAuthService },
      ],
    }).compile();

    controller = module.get<BranchAuthController>(BranchAuthController);
  });

  describe('login endpoint', () => {
    it('Delegates login request to BranchAuthService', async () => {
      const mockResult = {
        accessToken: 'mock.jwt.token',
        branch: { id: 'branch-1', name: 'Downtown Salon', code: 'DT01' },
        role: 'MANAGER',
      };
      branchAuthService.login.mockResolvedValue(mockResult);

      const dto = { pin: '1234' };
      const mockReq = {
        headers: { 'x-forwarded-for': '127.0.0.1' },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const result = await controller.login(dto, mockReq);

      expect(branchAuthService.login).toHaveBeenCalledWith(dto, '127.0.0.1');
      expect(result).toEqual(mockResult);
    });
  });
});
