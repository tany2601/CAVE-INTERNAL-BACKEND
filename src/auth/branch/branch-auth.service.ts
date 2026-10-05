import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PinService } from '../../common/security/pin.service.js';
import { BranchLoginDto } from './dto/branch-login.dto.js';

interface FailedAttemptRecord {
  count: number;
  lockoutUntil?: number;
}

@Injectable()
export class BranchAuthService {
  private readonly failedAttempts = new Map<string, FailedAttemptRecord>();
  private readonly maxAttempts = 5;
  private readonly lockoutDurationMs = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly pinService: PinService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: BranchLoginDto, clientIp: string = 'global') {
    // 1. Validate PIN format (4 digits)
    if (!this.pinService.validate4DigitPin(dto.pin)) {
      throw new UnauthorizedException('Invalid PIN or credential not found.');
    }

    // 2. Check rate limit / brute force lockout
    this.checkRateLimit(clientIp);

    // 3. Get lookup secret from config
    const lookupSecret = this.configService.get<string>(
      'BRANCH_PIN_LOOKUP_SECRET',
    );
    if (!lookupSecret) {
      throw new InternalServerErrorException(
        'BRANCH_PIN_LOOKUP_SECRET is not configured.',
      );
    }

    // 4. Calculate HMAC-SHA256 lookup
    const pinLookup = this.pinService.generatePinLookup(dto.pin, lookupSecret);

    // 5. Find matching credential in BranchRoleCredential
    // `join` fetches credential, branch and role in one round trip instead of three.
    const credential = await this.prisma.branchRoleCredential.findUnique({
      relationLoadStrategy: 'join',
      where: { pinLookup },
      include: {
        branch: true,
        role: true,
      },
    });

    // 6. Verify existence and active statuses of branch & role
    if (
      !credential ||
      !credential.branch ||
      !credential.branch.isActive ||
      !credential.role ||
      !credential.role.isActive
    ) {
      this.recordFailedAttempt(clientIp);
      throw new UnauthorizedException('Invalid PIN or credential not found.');
    }

    // 7. Verify bcrypt PIN hash
    const isValidPin = await this.pinService.verify4DigitPin(
      dto.pin,
      credential.pinHash,
    );

    if (!isValidPin) {
      this.recordFailedAttempt(clientIp);
      throw new UnauthorizedException('Invalid PIN or credential not found.');
    }

    // 8. Successful login -> clear rate limit tracker for IP
    this.failedAttempts.delete(clientIp);

    // 9. Generate branch JWT token carrying branchId, role, and branch_auth context
    const accessToken = this.generateJwtToken(
      credential.id,
      credential.branchId,
      credential.role.name,
    );

    return {
      accessToken,
      branch: {
        id: credential.branch.id,
        name: credential.branch.name,
        code: credential.branch.code,
      },
      role: credential.role.name,
    };
  }

  private checkRateLimit(key: string): void {
    const record = this.failedAttempts.get(key);
    if (!record) return;

    const now = Date.now();
    if (record.lockoutUntil && record.lockoutUntil > now) {
      throw new UnauthorizedException(
        'Too many failed login attempts. Please try again later.',
      );
    }

    if (record.lockoutUntil && record.lockoutUntil <= now) {
      this.failedAttempts.delete(key);
    }
  }

  private recordFailedAttempt(key: string): void {
    const record = this.failedAttempts.get(key) || { count: 0 };
    record.count += 1;

    if (record.count >= this.maxAttempts) {
      record.lockoutUntil = Date.now() + this.lockoutDurationMs;
    }

    this.failedAttempts.set(key, record);
  }

  private generateJwtToken(
    credentialId: string,
    branchId: string,
    roleName: string,
  ): string {
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
      sub: credentialId,
      branchId,
      role: roleName,
      type: 'branch_auth',
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
