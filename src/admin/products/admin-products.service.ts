import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateProductDto, UpdateProductDto } from './admin-products.dto.js';

@Injectable()
export class AdminProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private format(p: any) {
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      category: p.category ?? '',
      price: Number(p.price),
      imageUrl: p.imageUrl ?? null,
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async list() {
    const products = await this.prisma.product.findMany({ orderBy: { createdAt: 'asc' } });
    return { data: products.map((p) => this.format(p)) };
  }

  async create(dto: CreateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('A product with this name already exists.');
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        price: dto.price,
        description: dto.description || null,
        category: dto.category || null,
        imageUrl: dto.imageUrl || null,
        isActive: dto.isActive ?? true,
      },
    });
    return this.format(product);
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found.');
    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.product.findUnique({ where: { name: dto.name } });
      if (clash) throw new ConflictException('A product with this name already exists.');
    }
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
        ...(dto.category !== undefined ? { category: dto.category || null } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return this.format(product);
  }

  /** Past sessions keep their own product name/price snapshot, so a hard delete is safe. */
  async remove(id: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found.');
    await this.prisma.product.delete({ where: { id } });
    return { message: 'Product deleted successfully' };
  }
}
