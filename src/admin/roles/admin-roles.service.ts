import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GetRolesQueryDto } from './dto/get-roles-query.dto.js';

@Injectable()
export class AdminRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async getRoles(query: GetRolesQueryDto) {
    const includeAdmin = query.includeAdmin === true;

    const where: any = {
      isActive: true,
    };

    if (!includeAdmin) {
      where.name = {
        in: ['MANAGER', 'STYLIST'],
      };
    }

    const roles = await this.prisma.role.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      data: roles,
    };
  }
}
