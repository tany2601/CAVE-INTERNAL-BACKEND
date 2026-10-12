import { describe, it, expect } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import crypto from 'node:crypto';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const SECRET = 'a-test-secret-that-is-long-enough-1234567890';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (header: object, payload: object, secret = SECRET) => {
  const h = b64(header);
  const p = b64(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
};
const exp = (offset: number) => Math.floor(Date.now() / 1000) + offset;

const guardFor = (secret: string | undefined = SECRET) =>
  new JwtAuthGuard({ get: (k: string) => (k === 'JWT_SECRET' ? secret : undefined) } as any);
const ctx = (token: string) => {
  const request: any = { headers: { authorization: `Bearer ${token}` } };
  return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } as any };
};

describe('JwtAuthGuard', () => {
  it('accepts a correctly signed, unexpired token and exposes the role', () => {
    const { request, context } = ctx(sign({ alg: 'HS256', typ: 'JWT' }, { sub: 'u1', role: 'ADMIN', exp: exp(60) }));
    expect(guardFor().canActivate(context)).toBe(true);
    expect(request.user).toMatchObject({ id: 'u1', role: 'ADMIN' });
  });

  it('rejects an unsigned "alg: none" token claiming to be admin', () => {
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'x', role: 'ADMIN', exp: exp(60) })}.`;
    expect(() => guardFor().canActivate(ctx(forged).context)).toThrow(UnauthorizedException);
  });

  it('rejects a token whose header names any other algorithm, even with a signature', () => {
    const t = sign({ alg: 'HS512', typ: 'JWT' }, { sub: 'x', role: 'ADMIN', exp: exp(60) });
    expect(() => guardFor().canActivate(ctx(t).context)).toThrow(UnauthorizedException);
  });

  it('rejects a token signed with a different secret', () => {
    const t = sign({ alg: 'HS256' }, { sub: 'x', role: 'ADMIN', exp: exp(60) }, 'some-other-secret');
    expect(() => guardFor().canActivate(ctx(t).context)).toThrow(/signature/i);
  });

  it('rejects a tampered payload', () => {
    const good = sign({ alg: 'HS256' }, { sub: 'x', role: 'STYLIST', exp: exp(60) });
    const [h, , s] = good.split('.');
    const tampered = `${h}.${b64({ sub: 'x', role: 'ADMIN', exp: exp(60) })}.${s}`;
    expect(() => guardFor().canActivate(ctx(tampered).context)).toThrow(UnauthorizedException);
  });

  it('rejects expired tokens and tokens with no expiry', () => {
    expect(() =>
      guardFor().canActivate(ctx(sign({ alg: 'HS256' }, { sub: 'x', role: 'ADMIN', exp: exp(-5) })).context),
    ).toThrow(/expired/i);
    expect(() =>
      guardFor().canActivate(ctx(sign({ alg: 'HS256' }, { sub: 'x', role: 'ADMIN' })).context),
    ).toThrow(UnauthorizedException);
  });

  it('trusts nothing when no secret is configured', () => {
    const t = sign({ alg: 'HS256' }, { sub: 'x', role: 'ADMIN', exp: exp(60) }, '');
    expect(() => guardFor(undefined).canActivate(ctx(t).context)).toThrow(UnauthorizedException);
  });
});
