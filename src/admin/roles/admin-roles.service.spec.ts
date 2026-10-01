import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminRolesService } from './admin-roles.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('AdminRolesService', () => {
  let service: AdminRolesService;
  let prismaService: {
    role: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  const mockRoles = [
    { id: 'role-manager', name: 'MANAGER', description: 'Branch manager' },
    { id: 'role-stylist', name: 'STYLIST', description: 'Salon stylist' },
  ];

  beforeEach(async () => {
    prismaService = {
      role: {
        findMany: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminRolesService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<AdminRolesService>(AdminRolesService);
  });

  describe('getRoles', () => {
    it('1. Returns active Manager and Stylist roles by default (excluding Admin)', async () => {
      prismaService.role.findMany.mockResolvedValue(mockRoles);

      const result = await service.getRoles({});

      expect(result).toEqual({ data: mockRoles });
      expect(prismaService.role.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          name: {
            in: ['MANAGER', 'STYLIST'],
          },
        },
        select: {
          id: true,
          name: true,
          description: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
    });

    it('2. Includes ADMIN role when includeAdmin is true', async () => {
      const allRoles = [
        { id: 'role-admin', name: 'ADMIN', description: 'System admin' },
        ...mockRoles,
      ];
      prismaService.role.findMany.mockResolvedValue(allRoles);

      const result = await service.getRoles({ includeAdmin: true });

      expect(result).toEqual({ data: allRoles });
      expect(prismaService.role.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          description: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
    });

    it('3. Returns empty array if no matching active roles exist', async () => {
      prismaService.role.findMany.mockResolvedValue([]);

      const result = await service.getRoles({});

      expect(result).toEqual({ data: [] });
    });
  });
});
