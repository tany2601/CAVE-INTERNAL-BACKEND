import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateChecklistTaskDto, UpdateChecklistTaskDto } from './admin-checklist.dto.js';

@Injectable()
export class AdminChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  private format(t: any) {
    return {
      id: t.id,
      task: t.task,
      description: t.description ?? '',
      branchId: t.branchId,
      sortOrder: t.sortOrder,
    };
  }

  async list() {
    const tasks = await this.prisma.checklistTask.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { data: tasks.map((t) => this.format(t)) };
  }

  async create(dto: CreateChecklistTaskDto) {
    const last = await this.prisma.checklistTask.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: 'desc' },
    });
    const task = await this.prisma.checklistTask.create({
      data: {
        task: dto.task,
        description: dto.description || null,
        branchId: dto.branchId ?? null,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
    return this.format(task);
  }

  async update(id: string, dto: UpdateChecklistTaskDto) {
    const existing = await this.prisma.checklistTask.findUnique({ where: { id } });
    if (!existing || !existing.isActive) throw new NotFoundException('Checklist task not found.');
    const task = await this.prisma.checklistTask.update({
      where: { id },
      data: {
        ...(dto.task !== undefined ? { task: dto.task } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
      },
    });
    return this.format(task);
  }

  async remove(id: string) {
    const existing = await this.prisma.checklistTask.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Checklist task not found.');
    await this.prisma.checklistTask.delete({ where: { id } });
    return { message: 'Checklist task deleted' };
  }
}
