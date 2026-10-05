import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

const TOKEN_TTL_SECONDS = 24 * 60 * 60;

/**
 * Sliding session renewal. A still-valid access token is exchanged for a fresh one with the
 * same claims, so a tablet that keeps being used never has to sign in again; one that is
 * left idle past the token lifetime does.
 */
@Injectable()
export class TokenRefreshService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** `claims` come from a token the JwtAuthGuard has already verified. */
  async refresh(claims: Record<string, any>) {
    await this.assertStillAllowed(claims);

    const { iat: _iat, exp: _exp, ...rest } = claims;
    // The guard decorates request.user with id/role aliases; drop the ones the token never had.
    const original: Record<string, any> = { ...rest };
    if (original.sub !== undefined) delete original.id;

    const now = Math.floor(Date.now() / 1000);
    const accessToken = this.sign({ ...original, iat: now, exp: now + TOKEN_TTL_SECONDS });
    return { accessToken, expiresAt: (now + TOKEN_TTL_SECONDS) * 1000 };
  }

  private async assertStillAllowed(claims: Record<string, any>) {
    if (claims.type === 'branch_auth') {
      const branch = await this.prisma.branch.findUnique({ where: { id: claims.branchId } });
      if (!branch || !branch.isActive) {
        throw new UnauthorizedException('Branch is inactive or no longer exists.');
      }
      return;
    }
    if (claims.role === 'ADMIN') {
      const admin = await this.prisma.user.findUnique({ where: { id: claims.sub ?? claims.id } });
      if (!admin || !admin.isActive) {
        throw new UnauthorizedException('Admin account is inactive or no longer exists.');
      }
      return;
    }
    throw new UnauthorizedException('This token cannot be renewed.');
  }

  private sign(payload: Record<string, any>): string {
    const secret =
      this.configService.get<string>('JWT_SECRET') ||
      this.configService.get<string>('SUPABASE_SECRET_KEY') ||
      '';
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${signature}`;
  }
}
