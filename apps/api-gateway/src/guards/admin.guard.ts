import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { TokenPayload } from '@app/shared';

// Role-based admin gate: the JWT's `role` claim (set at register/login from
// the User.role DB column) is the source of truth. Runs after the global
// JwtAuthGuard, so request.user is set.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: TokenPayload }>();

    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}
