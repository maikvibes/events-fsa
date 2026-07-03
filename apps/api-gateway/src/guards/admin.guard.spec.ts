import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function contextWithUser(user?: { role?: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows a request whose token role is admin', () => {
    expect(guard.canActivate(contextWithUser({ role: 'admin' }))).toBe(true);
  });

  it('rejects a request whose token role is user', () => {
    expect(() => guard.canActivate(contextWithUser({ role: 'user' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a request with no user on it', () => {
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
