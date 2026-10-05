import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminProductsService } from './admin-products.service.js';

describe('AdminProductsService', () => {
  let prisma: any;
  let service: AdminProductsService;
  const row = (over: any = {}) => ({
    id: 'p1',
    name: 'Matte Clay',
    price: '599.00',
    description: null,
    category: null,
    imageUrl: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  beforeEach(() => {
    prisma = {
      product: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    service = new AdminProductsService(prisma);
  });

  it('lists products with numeric prices and empty strings for missing text', async () => {
    prisma.product.findMany.mockResolvedValue([row()]);
    const res = await service.list();
    expect(res.data[0]).toMatchObject({ name: 'Matte Clay', price: 599, description: '', category: '' });
  });

  it('refuses duplicate product names on create and on rename', async () => {
    prisma.product.findUnique.mockResolvedValue(row());
    await expect(service.create({ name: 'Matte Clay', price: 1 })).rejects.toThrow(ConflictException);

    prisma.product.findUnique
      .mockResolvedValueOnce(row({ id: 'p2', name: 'Beard Oil' })) // the product being edited
      .mockResolvedValueOnce(row()); // the clashing one
    await expect(service.update('p2', { name: 'Matte Clay' })).rejects.toThrow(ConflictException);
  });

  it('creates active products by default', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.product.create.mockImplementation(async ({ data }: any) => row(data));
    const res = await service.create({ name: 'Beard Oil', price: 449 });
    expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({ isActive: true });
    expect(res.price).toBe(449);
  });

  it('only changes the fields that were sent', async () => {
    prisma.product.findUnique.mockResolvedValue(row());
    prisma.product.update.mockResolvedValue(row({ isActive: false }));
    await service.update('p1', { isActive: false });
    expect(prisma.product.update.mock.calls[0][0].data).toEqual({ isActive: false });
  });

  it('404s when editing or deleting a missing product', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.update('x', { price: 1 })).rejects.toThrow(NotFoundException);
    await expect(service.remove('x')).rejects.toThrow(NotFoundException);
  });
});
