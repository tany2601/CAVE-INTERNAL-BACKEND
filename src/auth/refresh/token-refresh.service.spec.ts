import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import crypto from 'node:crypto';
import { TokenRefreshService } from './token-refresh.service.js';

const decode = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

describe('TokenRefreshService', () => {
  let prisma: any;
  let service: TokenRefreshService;
  const config = { get: (k: string) => (k === 'JWT_SECRET' ? 'secret' : undefined) } as any;

  beforeEach(() => {
    prisma = {
      branch: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
    };
    service = new TokenRefreshService(prisma, config);
  });

  it('re-issues a branch token with the same claims and a new expiry', async () => {
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', isActive: true });
    const res = await service.refresh({
      sub: 'cred-1', branchId: 'b1', role: 'MANAGER', type: 'branch_auth',
      iat: 1, exp: 2, id: 'cred-1', // guard aliases
    });
    const payload = decode(res.accessToken);
    expect(payload).toMatchObject({ sub: 'cred-1', branchId: 'b1', role: 'MANAGER', type: 'branch_auth' });
    expect(payload.id).toBeUndefined();
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
    // signature verifies with the same secret
    const [h, b, sig] = res.accessToken.split('.');
    expect(sig).toBe(crypto.createHmac('sha256', 'secret').update(`${h}.${b}`).digest('base64url'));
  });

  it('refuses once the branch is deactivated', async () => {
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', isActive: false });
    await expect(
      service.refresh({ sub: 'c', branchId: 'b1', role: 'STYLIST', type: 'branch_auth' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('renews an admin token only while the admin is active', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'a1', isActive: true });
    const ok = await service.refresh({ sub: 'a1', role: 'ADMIN', id: 'a1' });
    expect(decode(ok.accessToken)).toMatchObject({ sub: 'a1', role: 'ADMIN' });

    prisma.user.findUnique.mockResolvedValue({ id: 'a1', isActive: false });
    await expect(service.refresh({ sub: 'a1', role: 'ADMIN' })).rejects.toThrow(UnauthorizedException);
  });

  it('does not renew unknown token kinds', async () => {
    await expect(service.refresh({ sub: 'x', role: 'STYLIST' })).rejects.toThrow(UnauthorizedException);
  });
});
