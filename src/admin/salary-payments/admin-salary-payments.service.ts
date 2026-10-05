import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateSalaryPaymentDto } from './admin-salary-payments.dto.js';

@Injectable()
export class AdminSalaryPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSalaryPaymentDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: { role: true },
    });
    if (!user || !user.isActive || user.role?.name === 'ADMIN') {
      throw new BadRequestException('Employee is invalid or inactive.');
    }
    const payment = await this.prisma.salaryPayment.create({
      data: {
        userId: user.id,
        branchId: user.branchId,
        amount: dto.amount,
        via: dto.via ?? 'GPAY',
        note: dto.note ?? null,
      },
    });
    return this.format(payment, user.name);
  }

  async list(query: { userId?: string; branchId?: string }) {
    const rows = await this.prisma.salaryPayment.findMany({
      where: {
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { data: rows.map((r) => this.format(r, r.user.name)) };
  }

  private format(p: any, name: string) {
    return {
      id: p.id,
      userId: p.userId,
      employee: name,
      branchId: p.branchId,
      amount: Number(p.amount),
      via: p.via,
      note: p.note,
      createdAt: p.createdAt,
    };
  }
}
