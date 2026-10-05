import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AdminChecklistService } from './admin-checklist.service.js';

describe('AdminChecklistService', () => {
  let prisma: any;
  let service: AdminChecklistService;

  beforeEach(() => {
    prisma = {
      checklistTask: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    service = new AdminChecklistService(prisma);
  });

  it('appends new tasks after the last sort order', async () => {
    prisma.checklistTask.findFirst.mockResolvedValue({ sortOrder: 7 });
    prisma.checklistTask.create.mockImplementation(async ({ data }: any) => ({ id: 't', ...data }));
    const res = await service.create({ task: 'Mop floor' });
    expect(prisma.checklistTask.create.mock.calls[0][0].data).toMatchObject({
      task: 'Mop floor',
      sortOrder: 8,
      branchId: null,
    });
    expect(res.sortOrder).toBe(8);
  });

  it('404s when updating or deleting a missing task', async () => {
    prisma.checklistTask.findUnique.mockResolvedValue(null);
    await expect(service.update('x', { task: 'a' })).rejects.toThrow(NotFoundException);
    await expect(service.remove('x')).rejects.toThrow(NotFoundException);
  });

  it('lists only active tasks in order', async () => {
    prisma.checklistTask.findMany.mockResolvedValue([
      { id: 't1', task: 'A', description: null, branchId: null, sortOrder: 1 },
    ]);
    const res = await service.list();
    expect(prisma.checklistTask.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
    expect(res.data[0]).toMatchObject({ id: 't1', description: '' });
  });
});
