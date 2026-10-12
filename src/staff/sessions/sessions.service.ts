import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SessionStatus, DiscountType, PaymentMode } from '@prisma/client';
import { CreateSessionDto } from './dto/create-session.dto.js';
import { CloseSessionDto } from './dto/close-session.dto.js';
import { AssignStylistDto } from './dto/assign-stylist.dto.js';
import { freeHaircutIndex, isFreeVisitNext } from '../../common/loyalty.js';
import { WhatsappService } from '../../whatsapp/whatsapp.service.js';

/** Another request closed this bill first. */
class AlreadyClosed extends Error {}
/** The customer's visit number turned out different from the first guess, so the bill must be made again. */
class FreeVisitChanged extends Error {
  constructor(readonly free: boolean) {
    super('free visit changed');
  }
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly whatsapp?: WhatsappService,
  ) {}

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

  /** Delivery state of this bill's WhatsApp message (see WhatsappService.billStatus). */
  async getBillWhatsappStatus(reqUser: any, sessionId: string) {
    const { branchId } = await this.resolveBranchContext(reqUser);
    return (await this.whatsapp?.billStatus(sessionId, branchId)) ?? { status: 'none' as const };
  }

  /** The closed bill as a picture (PNG); only for a bill of the caller's own branch. */
  async getBillImage(reqUser: any, sessionId: string): Promise<Buffer> {
    const { branchId } = await this.resolveBranchContext(reqUser);
    const png = await this.whatsapp?.billImage(sessionId, branchId);
    if (!png) throw new NotFoundException('That bill was not found, or it has not been closed yet.');
    return png;
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
      // Billed: was it the free-haircut visit. Still open: would it be, going by the customer's visits so far.
      isFreeVisit:
        session.status === SessionStatus.ACTIVE
          ? !!session.customer && isFreeVisitNext(session.customer.qualifyingCompletedSessionsCount)
          : (session.isFreeVisit ?? false),
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
        try {
          customer = await this.prisma.customer.create({
            data: {
              name: dto.customerName,
              phone: normalizedPhone,
              qualifyingCompletedSessionsCount: 0,
              rewardEarned: false,
            },
          });
        } catch (e) {
          // Two branches checked this new customer in at the same moment; the other one created them first.
          if ((e as { code?: string }).code !== 'P2002') throw e;
          customer = await this.prisma.customer.findUnique({ where: { phone: normalizedPhone } });
        }
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
  private async computeBilling(branchId: string, dto: CloseSessionDto, freeVisit = false) {
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

    // The customer's free visit: their cheapest haircut is on the house. Applied here, so billing and
    // every later manager edit give the same answer.
    if (freeVisit) {
      const free = freeHaircutIndex(menuServiceItems.map((i) => ({ name: i.serviceName, price: i.price })));
      if (free >= 0) menuServiceItems[free] = { ...menuServiceItems[free], price: 0 };
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

    // A bill is made, then saved in one transaction that first claims the session. If two requests close the
    // same bill at once (a double tap, a retry on a bad connection) only one wins; the other gets the finished
    // bill back. The customer's visit count is bumped atomically inside that transaction, so bills closed at
    // different branches at the same moment can't overwrite each other's count. The free-haircut visit is
    // decided from the count at that moment; if it turns out different from the first guess, bill again.
    const billingContact = this.normalizePhone(dto.whatsappTo);
    let freeVisit = !!session.customer && isFreeVisitNext(session.customer.qualifyingCompletedSessionsCount);

    for (let attempt = 0; attempt < 3; attempt += 1) {
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
      } = await this.computeBilling(branchId, dto, freeVisit);

      const closedAt = new Date();
      const startedAt = session.startedAt || session.createdAt;

      try {
        const closedSession = await this.prisma.$transaction(async (tx) => {
          // 1. Claim the session: only an ACTIVE one can be closed, and only once.
          const claimed = await tx.session.updateMany({
            where: { id: sessionId, status: SessionStatus.ACTIVE },
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
              isFreeVisit: freeVisit,
              // A number typed in at billing (walk-ins, product-only sales) is kept on the bill so the
              // WhatsApp message has somewhere to go; a number saved at check-in always wins.
              ...(billingContact && !session.customerMobile ? { customerMobile: billingContact } : {}),
            },
          });
          if (claimed.count !== 1) throw new AlreadyClosed();

          // 2. Loyalty: count this visit atomically and see which visit it was.
          if (session.customerId && !session.isLoyaltyCounted) {
            const counted = await tx.customer.update({
              where: { id: session.customerId },
              data: { qualifyingCompletedSessionsCount: { increment: 1 } },
            });
            const prior = counted.qualifyingCompletedSessionsCount - 1;
            const actuallyFree = isFreeVisitNext(prior);
            if (actuallyFree !== freeVisit) throw new FreeVisitChanged(actuallyFree); // rolls everything back
            if (counted.qualifyingCompletedSessionsCount % 6 === 0) {
              await tx.customer.update({ where: { id: session.customerId }, data: { rewardEarned: true } });
            }
          }

          // 3. Line items (replacing any services pre-selected at check-in)
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

        // The WhatsApp bill is queued after the response data is ready and never holds billing up.
        void this.whatsapp?.sendBill(sessionId);

        return {
          message: 'Session closed and billed successfully',
          session: this.formatSessionOutput(closedSession),
        };
      } catch (e) {
        if (e instanceof FreeVisitChanged) {
          freeVisit = e.free;
          continue;
        }
        if (e instanceof AlreadyClosed) {
          const done = await this.prisma.session.findUnique({
            where: { id: sessionId },
            include: {
              branch: { select: { id: true, name: true, code: true } },
              stylist: { select: { id: true, name: true } },
              customer: true,
              services: true,
              products: true,
            },
          });
          if (done?.status === SessionStatus.COMPLETED) {
            return { message: 'Session is already closed and billed', session: this.formatSessionOutput(done) };
          }
          throw new BadRequestException('Session is inactive or cancelled.');
        }
        throw e;
      }
    }
    throw new BadRequestException('The bill changed while it was being saved. Please try again.');
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

    const billing = await this.computeBilling(branchId, dto, session.isFreeVisit);

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
