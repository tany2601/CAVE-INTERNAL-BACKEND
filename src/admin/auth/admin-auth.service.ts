import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PinService } from '../../common/security/pin.service.js';
import { SetupAdminDto } from './dto/setup-admin.dto.js';
import { ChangeAdminPinDto } from './dto/change-admin-pin.dto.js';
import { AdminLoginDto } from './dto/admin-login.dto.js';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pinService: PinService,
    private readonly configService: ConfigService,
  ) {}

  async setupAdmin(dto: SetupAdminDto) {
    // 1. Find ADMIN role in database
    const adminRole = await this.prisma.role.findUnique({
      where: { name: 'ADMIN' },
    });

    if (!adminRole) {
      throw new NotFoundException('ADMIN role not found in the database.');
    }

    // 2. Check if an ADMIN user already exists
    const existingAdmin = await this.prisma.user.findFirst({
      where: { roleId: adminRole.id },
    });

    if (existingAdmin) {
      throw new ConflictException('Admin account already exists.');
    }

    // 3. Check if email is already taken
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingEmail) {
      throw new ConflictException('User with this email already exists.');
    }

    // 4. Hash the PIN using PinService
    const pinHash = await this.pinService.hashPin(dto.pin);

    // 5. Create global ADMIN user record
    const adminUser = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        pinHash,
        roleId: adminRole.id,
        branchId: null,
        isActive: true,
      },
      include: {
        role: true,
      },
    });

    // 6. Return response containing safe Admin information
    return {
      message: 'Admin account created successfully',
      admin: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role.name,
      },
    };
  }

  async changePin(adminId: string, dto: ChangeAdminPinDto) {
    // 1. Validate PIN formats (6 numeric digits)
    if (
      !this.pinService.validatePin(dto.currentPin) ||
      !this.pinService.validatePin(dto.newPin)
    ) {
      throw new BadRequestException('PIN must be exactly 6 numeric digits.');
    }

    // 2. Find Admin user in DB
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (!admin || admin.role?.name !== 'ADMIN') {
      throw new UnauthorizedException('Admin account not found.');
    }

    // 3. Verify current PIN against stored pinHash using PinService
    if (!admin.pinHash) {
      throw new UnauthorizedException('Incorrect current PIN.');
    }

    const isCurrentPinValid = await this.pinService.verifyPin(
      dto.currentPin,
      admin.pinHash,
    );

    if (!isCurrentPinValid) {
      throw new UnauthorizedException('Incorrect current PIN.');
    }

    // 4. Hash new PIN using PinService
    const newPinHash = await this.pinService.hashPin(dto.newPin);

    // 5. Update pinHash in database for logged-in Admin ONLY
    await this.prisma.user.update({
      where: { id: adminId },
      data: { pinHash: newPinHash },
    });

    // 6. Return success message without exposing PIN or pinHash
    return {
      message: 'Admin PIN changed successfully',
    };
  }

  async login(dto: AdminLoginDto) {
    // 1. Validate PIN format using PinService
    if (!this.pinService.validatePin(dto.pin)) {
      throw new UnauthorizedException('Invalid PIN.');
    }

    // 2. Find ADMIN role in database
    const adminRole = await this.prisma.role.findUnique({
      where: { name: 'ADMIN' },
    });

    if (!adminRole) {
      throw new UnauthorizedException('Invalid PIN or admin account not found.');
    }

    // 3. Find global Admin account (roleId matches ADMIN, branchId is null)
    const adminUser = await this.prisma.user.findFirst({
      where: {
        roleId: adminRole.id,
        branchId: null,
      },
      include: {
        role: true,
      },
    });

    // 4. Verify account existence and active status
    if (!adminUser || !adminUser.isActive) {
      throw new UnauthorizedException('Invalid PIN or admin account not found.');
    }

    if (!adminUser.pinHash) {
      throw new UnauthorizedException('Invalid PIN or admin account not found.');
    }

    // 5. Verify PIN against pinHash using PinService
    const isValidPin = await this.pinService.verifyPin(
      dto.pin,
      adminUser.pinHash,
    );

    if (!isValidPin) {
      throw new UnauthorizedException('Invalid PIN or admin account not found.');
    }

    // 6. Generate JWT with sub as admin user ID and role as "ADMIN"
    const accessToken = this.generateJwtToken(
      adminUser.id,
      adminUser.role.name,
    );

    // 7. Return consistent login response without sensitive fields
    return {
      accessToken,
    };
  }

  private generateJwtToken(userId: string, roleName: string): string {
    const jwtSecret =
      this.configService.get<string>('JWT_SECRET') ||
      this.configService.get<string>('SUPABASE_SECRET_KEY') ||
      '';

    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: userId,
      role: roleName,
      iat: now,
      exp: now + 24 * 60 * 60,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(
      JSON.stringify(payload),
    ).toString('base64url');

    const signatureB64 = crypto
      .createHmac('sha256', jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    return `${headerB64}.${payloadB64}.${signatureB64}`;
  }
}
