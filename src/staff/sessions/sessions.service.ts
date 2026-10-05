import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SessionStatus, DiscountType, PaymentMode } from '@prisma/client';
import { CreateSessionDto } from './dto/create-session.dto.js';
import { CloseSessionDto } from './dto/close-session.dto.js';
import { AssignStylistDto } from './dto/assign-stylist.dto.js';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveBranchContext(reqUser: any) {
    if (!reqUser) {
      throw new UnauthorizedException('Authentication required.');
    }

    let branchId = reqUser.branchId;

    if (!branchId && (reqUser.id || reqUser.sub)) {
      const userId = reqUser.id || reqUser.sub;
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { branchId: true },
      });
      if (user?.branchId) {
        branchId = user.branchId;
      }
    }

    if (!branchId) {
      throw new BadRequestException(
        'Branch context could not be identified from authentication token.',
      );
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch || !branch.isActive) {
      throw new BadRequestException('Branch is inactive or not found.');
    }

    return { branchId: branch.id, branchName: branch.name, branch };
  }

  private normalizePhone(phone?: string | null): string | null {
    if (!phone || typeof phone !== 'string') return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return digits;
    if (digits.length > 10 && digits.startsWith('91')) return digits.slice(-10);
    return digits || null;
  }

  private round2(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  public formatSessionOutput(session: any) {
    if (!session) return null;
    const startedAt = session.startedAt || session.createdAt;
    const endAt = session.closedAt || new Date();
    const durationMin = startedAt
      ? Math.max(
          0,
          Math.round(
            (new Date(endAt).getTime() - new Date(startedAt).getTime()) / 60000,
          ),
        )
      : null;

    return {
      id: session.id,
      branchId: session.branchId,
      branch: session.branch
        ? {
            id: session.branch.id,
            name: session.branch.name,
            code: session.branch.code,
          }
        : undefined,
      stylistId: session.stylistId ?? null,
      stylist: session.stylist
        ? {
            id: session.stylist.id,
            name: session.stylist.name,
          }
        : null,
      customerId: session.customerId ?? null,
      customer: session.customer
        ? {
            id: session.customer.id,
            name: session.customer.name,
            phone: session.customer.phone,
            qualifyingCompletedSessionsCount:
              session.customer.qualifyingCompletedSessionsCount,
            rewardEarned: session.customer.rewardEarned,
            nextRewardSessionsRemaining:
              6 - (session.customer.qualifyingCompletedSessionsCount % 6 || 6),
          }
        : null,
      customerName: session.customerName,
      customerMobile: session.customerMobile ?? null,
      status: session.status,
      subtotal: Number(session.subtotal),
      discountType: session.discountType,
      discountValue: Number(session.discountValue),
      discountAmount: Number(session.discountAmount),
      tipAmount: Number(session.tipAmount),
      totalAmount: Number(session.totalAmount),
      paymentMode: session.paymentMode ?? null,
      startedAt: session.startedAt ?? null,
      closedAt: session.closedAt ?? null,
      durationMin,
      isLoyaltyCounted: session.isLoyaltyCounted ?? false,
      isEdited: session.isEdited ?? false,
      editedAt: session.editedAt ?? null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      services: session.services
        ? session.services.map((s: any) => ({
            id: s.id,
            servicePricingId: s.servicePricingId ?? null,
            serviceName: s.serviceName,
            price: Number(s.price),
            isCustom: s.isCustom,
            createdAt: s.createdAt,
          }))
        : [],
      products: session.products
        ? session.products.map((p: any) => ({
            id: p.id,
            productName: p.productName,
            price: Number(p.price),
            paymentMode: p.paymentMode,
            createdAt: p.createdAt,
          }))
        : [],
    };
  }

  async listEligibleStylists(reqUser: any) {
    const { branchId } = await this.resolveBranchContext(reqUser);

    const stylists = await this.prisma.user.findMany({
      where: {
        branchId,
        isActive: true,
        role: {
          name: { in: ['STYLIST', 'MANAGER'] },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: { select: { id: true, name: true } },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      message: 'Eligible branch stylists retrieved successfully',
      data: stylists,
    };
  }

  async createSession(reqUser: any, dto: CreateSessionDto) {
    const { branchId, branch } = await this.resolveBranchContext(reqUser);
    const normalizedPhone = this.normalizePhone(dto.customerMobile);

    // These lookups don't depend on each other, so run them together (each one is a round-trip
    // to the database, which is what made starting a session feel slow).
    const [existingCustomer, existingActiveSession, stylistUser, pricing] =
      await Promise.all([
        normalizedPhone
          ? this.prisma.customer.findUnique({ where: { phone: normalizedPhone } })
          : null,
        // Prevent a duplicate active session for the same registered customer in the branch.
        normalizedPhone
          ? this.prisma.session.findFirst({
              where: {
                branchId,
                customerMobile: normalizedPhone,
                status: SessionStatus.ACTIVE,
              },
              include: {
                branch: { select: { id: true, name: true, code: true } },
                stylist: { select: { id: true, name: true } },
                customer: true,
                services: true,
                products: true,
              },
            })
          : null,
        dto.stylistId
          ? this.prisma.user.findUnique({
              where: { id: dto.stylistId },
              include: { role: true },
            })
          : null,
        dto.serviceIds?.length
          ? this.prisma.branchServicePricing.findMany({
              where: {
                id: { in: dto.serviceIds },
                branchId,
                isActive: true,
                service: { isActive: true },
              },
              include: { service: true },
            })
          : [],
      ]);

    if (existingActiveSession) {
      return {
        message: 'Active session already exists for this customer',
        session: this.formatSessionOutput(existingActiveSession),
      };
    }

    // Validate optional stylistId if provided during session creation
    let stylist: { id: string; name: string } | null = null;
    if (dto.stylistId) {
      if (
        !stylistUser ||
        !stylistUser.isActive ||
        stylistUser.branchId !== branchId ||
        !['STYLIST', 'MANAGER'].includes(stylistUser.role?.name || '')
      ) {
        throw new BadRequestException(
          'Selected stylist is invalid, inactive, or does not belong to your branch.',
        );
      }
      stylist = { id: stylistUser.id, name: stylistUser.name };
    }

    // Services picked at check-in must be live items on this branch's menu.
    let preselected: { servicePricingId: string; serviceName: string; price: number }[] = [];
    if (dto.serviceIds?.length) {
      if (pricing.length !== dto.serviceIds.length) {
        throw new BadRequestException(
          'One or more selected services are invalid, inactive, or not on your branch menu.',
        );
      }
      preselected = dto.serviceIds.map((id) => {
        const p = pricing.find((x) => x.id === id)!;
        return { servicePricingId: p.id, serviceName: p.service.name, price: p.price };
      });
    }

    // Find or create the customer (loyalty is tracked by phone).
    let customer = existingCustomer;
    if (normalizedPhone) {
      if (customer) {
        if (customer.name !== dto.customerName) {
          customer = await this.prisma.customer.update({
            where: { id: customer.id },
            data: { name: dto.customerName },
          });
        }
      } else {
        customer = await this.prisma.customer.create({
          data: {
            name: dto.customerName,
            phone: normalizedPhone,
            qualifyingCompletedSessionsCount: 0,
            rewardEarned: false,
          },
        });
      }
    }

    const created = await this.prisma.session.create({
      data: {
        branchId,
        stylistId: stylist?.id ?? null,
        customerId: customer?.id ?? null,
        customerName: dto.customerName,
        customerMobile: normalizedPhone,
        status: SessionStatus.ACTIVE,
        // startNow begins the service timer in the same request (saves a second round-trip).
        ...(dto.startNow ? { startedAt: new Date() } : {}),
        ...(preselected.length ? { services: { create: preselected } } : {}),
      },
      include: { services: true },
    });

    // Everything else in the response is already in hand, so no extra relation queries.
    return {
      message: 'Customer session created successfully',
      session: this.formatSessionOutput({
        ...created,
        branch,
        stylist,
        customer,
        products: [],
      }),
    };
  }

  async assignStylist(reqUser: any, sessionId: string, dto: AssignStylistDto) {
    const { branchId } = await this.resolveBranchContext(reqUser);

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found.');
    }

    if (session.branchId !== branchId) {
      throw new ForbiddenException(
        'Access denied: Cannot modify sessions belonging to another branch.',
      );
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Cannot assign stylist to an inactive or completed session.');
    }

    // Validate target stylist
    const stylistUser = await this.prisma.user.findUnique({
      where: { id: dto.stylistId },
      include: { role: true },
    });

    if (
      !stylistUser ||
      !stylistUser.isActive ||
      stylistUser.branchId !== branchId ||
      !['STYLIST', 'MANAGER'].includes(stylistUser.role?.name || '')
    ) {
      throw new BadRequestException(
        'Selected stylist is invalid, inactive, or does not belong to your branch.',
      );
    }

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: { stylistId: stylistUser.id },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        stylist: { select: { id: true, name: true } },
        customer: true,
        services: true,
        products: true,
      },
    });

    return {
      message: 'Stylist assigned to session successfully',
      session: this.formatSessionOutput(updatedSession),
    };
  }

  async startService(reqUser: any, sessionId: string) {
    const { branchId } = await this.resolveBranchContext(reqUser);

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found.');
    }

    if (session.branchId !== branchId) {
      throw new ForbiddenException(
        'Access denied: Cannot modify sessions belonging to another branch.',
      );
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Cannot start service on a closed or inactive session.');
    }

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        startedAt: session.startedAt || new Date(),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        stylist: { select: { id: true, name: true } },
        customer: true,
        services: true,
        products: true,
      },
    });

    return {
      message: 'Service started successfully',
      session: this.formatSessionOutput(updatedSession),
    };
  }

  async getActiveSessions(reqUser: any) {
    const { branchId } = await this.resolveBranchContext(reqUser);

    const activeSessions = await this.prisma.session.findMany({
      where: {
        branchId,
        status: SessionStatus.ACTIVE,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        stylist: { select: { id: true, name: true } },
        customer: true,
        services: true,
        products: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      data: activeSessions.map((s) => this.formatSessionOutput(s)),
    };
  }

  async getSessionById(reqUser: any, sessionId: string) {
    const { branchId } = await this.resolveBranchContext(reqUser);

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        stylist: { select: { id: true, name: true } },
        customer: true,
        services: true,
        products: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found.');
    }

    if (session.branchId !== branchId) {
      throw new ForbiddenException(
        'Access denied: Cannot view sessions belonging to another branch.',
      );
    }

    return this.formatSessionOutput(session);
  }

  /** Validates the bill lines against branch pricing and computes all totals. */
  private async computeBilling(branchId: string, dto: CloseSessionDto) {
    const hasServices = dto.services && dto.services.length > 0;
    const hasCustomServices = dto.customServices && dto.customServices.length > 0;
    const hasProducts = dto.productSales && dto.productSales.length > 0;

    if (!hasServices && !hasCustomServices && !hasProducts) {
      throw new BadRequestException(
        'At least one menu service, custom service, or product sale must be provided to close and bill the session.',
      );
    }

    // Process menu services
    const menuServiceItems: Array<{
      servicePricingId: string;
      serviceName: string;
      price: number;
      isCustom: boolean;
    }> = [];

    if (hasServices && dto.services) {
      const pricingIds = dto.services.map((s) => s.servicePricingId);
      const uniquePricingIds = Array.from(new Set(pricingIds));

      const pricingRecords = await this.prisma.branchServicePricing.findMany({
        where: {
          id: { in: uniquePricingIds },
          branchId,
          isActive: true,
          service: { isActive: true },
        },
        include: { service: true },
      });

      if (pricingRecords.length !== uniquePricingIds.length) {
        throw new BadRequestException(
          'One or more selected menu services are invalid, inactive, or do not belong to your branch.',
        );
      }

      const pricingMap = new Map(pricingRecords.map((p) => [p.id, p]));

      for (const item of dto.services) {
        const record = pricingMap.get(item.servicePricingId);
        if (!record) {
          throw new BadRequestException(
            `Service pricing record ${item.servicePricingId} not found or invalid.`,
          );
        }
        menuServiceItems.push({
          servicePricingId: record.id,
          serviceName: record.service.name,
          price: record.price,
          isCustom: false,
        });
      }
    }

    // Process custom services
    const customServiceItems: Array<{
      servicePricingId?: string;
      serviceName: string;
      price: number;
      isCustom: boolean;
    }> = [];

    if (hasCustomServices && dto.customServices) {
      for (const item of dto.customServices) {
        if (item.price < 0) {
          throw new BadRequestException('Custom service price must be non-negative.');
        }
        customServiceItems.push({
          serviceName: item.name,
          price: item.price,
          isCustom: true,
        });
      }
    }

    // Process product sales
    const productItems: Array<{
      productName: string;
      price: number;
      paymentMode: PaymentMode;
    }> = [];

    if (hasProducts && dto.productSales) {
      for (const item of dto.productSales) {
        if (item.price < 0) {
          throw new BadRequestException('Product price must be non-negative.');
        }
        productItems.push({
          productName: item.productName,
          price: item.price,
          paymentMode: item.paymentMode || PaymentMode.CASH,
        });
      }
    }

    // Compute pre-discount subtotal
    const servicesSubtotal = [...menuServiceItems, ...customServiceItems].reduce(
      (sum, item) => sum + item.price,
      0,
    );
    const productsSubtotal = productItems.reduce(
      (sum, item) => sum + item.price,
      0,
    );
    const preDiscountSubtotal = this.round2(servicesSubtotal + productsSubtotal);

    // Discount calculations
    const discountType = dto.discountType || DiscountType.NONE;
    const rawDiscountValue = dto.discountValue ?? 0;
    let discountValue = 0;
    let discountAmount = 0;

    if (discountType === DiscountType.PERCENTAGE) {
      if (rawDiscountValue < 0 || rawDiscountValue > 100) {
        throw new BadRequestException('Percentage discount must be between 0 and 100.');
      }
      discountValue = rawDiscountValue;
      discountAmount = this.round2((preDiscountSubtotal * discountValue) / 100);
    } else if (discountType === DiscountType.FIXED) {
      if (rawDiscountValue < 0) {
        throw new BadRequestException('Fixed discount amount must be non-negative.');
      }
      if (rawDiscountValue > preDiscountSubtotal) {
        throw new BadRequestException(
          'Fixed discount amount cannot exceed pre-discount subtotal.',
        );
      }
      discountValue = rawDiscountValue;
      discountAmount = this.round2(discountValue);
    }

    if (discountAmount > preDiscountSubtotal) {
      throw new BadRequestException(
        'Discount amount cannot exceed pre-discount subtotal.',
      );
    }

    const tipAmount = this.round2(dto.tipAmount ?? 0);
    const afterDiscountSubtotal = this.round2(preDiscountSubtotal - discountAmount);
    const totalAmount = this.round2(afterDiscountSubtotal + tipAmount);

    return {
      menuServiceItems,
      customServiceItems,
      productItems,
      preDiscountSubtotal,
      discountType,
      discountValue,
      discountAmount,
      tipAmount,
      totalAmount,
    };
  }

  async closeSession(reqUser: any, sessionId: string, dto: CloseSessionDto) {
    const { branchId } = await this.resolveBranchContext(reqUser);

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        stylist: { select: { id: true, name: true } },
        customer: true,
        services: true,
        products: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found.');
    }

    if (session.branchId !== branchId) {
      throw new ForbiddenException(
        'Access denied: Cannot close sessions belonging to another branch.',
      );
    }

    // Idempotency: Return existing completed session if already closed
    if (session.status === SessionStatus.COMPLETED) {
      return {
        message: 'Session is already closed and billed',
        session: this.formatSessionOutput(session),
      };
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Session is inactive or cancelled.');
    }

    const {
      menuServiceItems,
      customServiceItems,
      productItems,
      preDiscountSubtotal,
      discountType,
      discountValue,
      discountAmount,
      tipAmount,
      totalAmount,
    } = await this.computeBilling(branchId, dto);

    const closedAt = new Date();
    const startedAt = session.startedAt || session.createdAt;

    // Execute atomic transaction for closing session, creating line items, and incrementing customer loyalty progress
    const closedSession = await this.prisma.$transaction(async (tx) => {
      // 1. Update Session details
      await tx.session.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.COMPLETED,
          subtotal: preDiscountSubtotal,
          discountType,
          discountValue,
          discountAmount,
          tipAmount,
          totalAmount,
          paymentMode: dto.paymentMode,
          startedAt,
          closedAt,
          isLoyaltyCounted: true,
        },
      });

      // 2. Create SessionService records (replacing any services pre-selected at check-in)
      await tx.sessionService.deleteMany({ where: { sessionId } });
      const allServices = [...menuServiceItems, ...customServiceItems];
      if (allServices.length > 0) {
        await tx.sessionService.createMany({
          data: allServices.map((item) => ({
            sessionId,
            servicePricingId: item.servicePricingId || null,
            serviceName: item.serviceName,
            price: item.price,
            isCustom: item.isCustom,
          })),
        });
      }

      // 3. Create SessionProduct records
      if (productItems.length > 0) {
        await tx.sessionProduct.createMany({
          data: productItems.map((item) => ({
            sessionId,
            productName: item.productName,
            price: item.price,
            paymentMode: item.paymentMode,
          })),
        });
      }

      // 4. Update Loyalty Progress atomically (only once if not previously counted)
      if (session.customerId && !session.isLoyaltyCounted) {
        const existingCustomer = await tx.customer.findUnique({
          where: { id: session.customerId },
        });

        if (existingCustomer) {
          const updatedCount = existingCustomer.qualifyingCompletedSessionsCount + 1;
          const isSixthMilestone = updatedCount % 6 === 0;

          await tx.customer.update({
            where: { id: session.customerId },
            data: {
              qualifyingCompletedSessionsCount: updatedCount,
              rewardEarned: isSixthMilestone ? true : existingCustomer.rewardEarned,
            },
          });
        }
      }

      return tx.session.findUnique({
        where: { id: sessionId },
        include: {
          branch: { select: { id: true, name: true, code: true } },
          stylist: { select: { id: true, name: true } },
          customer: true,
          services: true,
          products: true,
        },
      });
    });

    return {
      message: 'Session closed and billed successfully',
      session: this.formatSessionOutput(closedSession),
    };
  }

  /** Manager correction of an already billed session. Replaces line items and totals. */
  async editSession(reqUser: any, sessionId: string, dto: CloseSessionDto) {
    const { branchId } = await this.resolveBranchContext(reqUser);

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found.');
    if (session.branchId !== branchId) {
      throw new ForbiddenException(
        'Access denied: Cannot modify sessions belonging to another branch.',
      );
    }
    if (session.status !== SessionStatus.COMPLETED) {
      throw new BadRequestException('Only billed sessions can be edited.');
    }

    const billing = await this.computeBilling(branchId, dto);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.sessionService.deleteMany({ where: { sessionId } });
      await tx.sessionProduct.deleteMany({ where: { sessionId } });

      const allServices = [
        ...billing.menuServiceItems,
        ...billing.customServiceItems,
      ];
      if (allServices.length > 0) {
        await tx.sessionService.createMany({
          data: allServices.map((item) => ({
            sessionId,
            servicePricingId: item.servicePricingId || null,
            serviceName: item.serviceName,
            price: item.price,
            isCustom: item.isCustom,
          })),
        });
      }
      if (billing.productItems.length > 0) {
        await tx.sessionProduct.createMany({
          data: billing.productItems.map((item) => ({
            sessionId,
            productName: item.productName,
            price: item.price,
            paymentMode: item.paymentMode,
          })),
        });
      }

      await tx.session.update({
        where: { id: sessionId },
        data: {
          subtotal: billing.preDiscountSubtotal,
          discountType: billing.discountType,
          discountValue: billing.discountValue,
          discountAmount: billing.discountAmount,
          tipAmount: billing.tipAmount,
          totalAmount: billing.totalAmount,
          paymentMode: dto.paymentMode,
          isEdited: true,
          editedAt: new Date(),
        },
      });

      return tx.session.findUnique({
        where: { id: sessionId },
        include: {
          branch: { select: { id: true, name: true, code: true } },
          stylist: { select: { id: true, name: true } },
          customer: true,
          services: true,
          products: true,
        },
      });
    });

    return {
      message: 'Session updated successfully',
      session: this.formatSessionOutput(updated),
    };
  }

  /** Voids a session (kept for audit as CANCELLED) and rolls back its loyalty credit. */
  async cancelSession(reqUser: any, sessionId: string) {
    const { branchId } = await this.resolveBranchContext(reqUser);

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found.');
    if (session.branchId !== branchId) {
      throw new ForbiddenException(
        'Access denied: Cannot modify sessions belonging to another branch.',
      );
    }
    if (session.status === SessionStatus.CANCELLED) {
      return { message: 'Session already deleted' };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: sessionId },
        data: { status: SessionStatus.CANCELLED, isLoyaltyCounted: false },
      });

      if (session.isLoyaltyCounted && session.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: session.customerId },
        });
        if (customer) {
          const count = Math.max(0, customer.qualifyingCompletedSessionsCount - 1);
          await tx.customer.update({
            where: { id: customer.id },
            data: {
              qualifyingCompletedSessionsCount: count,
              rewardEarned: count > 0 && count % 6 === 0,
            },
          });
        }
      }
    });

    return { message: 'Session deleted successfully' };
  }
}
