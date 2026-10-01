import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';

export interface JwtPayload {
  sub?: string;
  id?: string;
  email?: string;
  role?: string;
  [key: string]: any;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader =
      request.headers?.authorization || request.headers?.Authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Missing authorization header');
    }

    const parts = authHeader.trim().split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      throw new UnauthorizedException('Invalid authorization token format');
    }

    const token = parts[1];

    try {
      const payload = this.verifyAndDecodeToken(token);

      request.user = {
        ...payload,
        id: payload.sub || payload.id || payload.userId,
        role: payload.role || payload.roleName,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private verifyAndDecodeToken(token: string): JwtPayload {
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      throw new UnauthorizedException('Malformed JWT token');
    }

    const [headerB64, payloadB64, signatureB64] = tokenParts;

    let header: any;
    let payload: JwtPayload;

    try {
      header = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString('utf-8'),
      );
      payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf-8'),
      );
    } catch {
      throw new UnauthorizedException('Invalid JWT payload');
    }

    if (payload.exp && typeof payload.exp === 'number') {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      if (nowInSeconds >= payload.exp) {
        throw new UnauthorizedException('Token has expired');
      }
    }

    const jwtSecret =
      this.configService.get<string>('JWT_SECRET') ||
      this.configService.get<string>('SUPABASE_SECRET_KEY');

    if (jwtSecret && header.alg === 'HS256') {
      const expectedSignature = crypto
        .createHmac('sha256', jwtSecret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      if (signatureB64 !== expectedSignature) {
        throw new UnauthorizedException('Invalid JWT signature');
      }
    }

    return payload;
  }
}
