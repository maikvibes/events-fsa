import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const validateToken = jest.fn();
  const authClient = { getService: () => ({ validateToken }) };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  } as unknown as Reflector;

  const contextFor = (headers: Record<string, string>) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('sets request.user and returns true for a valid token', async () => {
    validateToken.mockReturnValue(
      of({ userId: '1', email: 'a@b.com', role: 'user' }),
    );
    const guard = new JwtAuthGuard(reflector, authClient as never);
    const ctx = contextFor({ authorization: 'Bearer good-token' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(validateToken).toHaveBeenCalledWith({ token: 'good-token' });
  });

  it('throws Unauthorized when the gRPC call rejects', async () => {
    validateToken.mockReturnValue(throwError(() => new Error('invalid')));
    const guard = new JwtAuthGuard(reflector, authClient as never);
    const ctx = contextFor({ authorization: 'Bearer bad-token' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws Unauthorized when no bearer header is present', async () => {
    const guard = new JwtAuthGuard(reflector, authClient as never);
    const ctx = contextFor({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
