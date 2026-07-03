import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { TokenPayload } from '@app/shared';

// Minimal admin gate: allowlist of emails from the ADMIN_EMAILS env var
// (comma-separated). Runs after the global JwtAuthGuard, so request.user is set.
// A proper role-based check would need a `role` claim in the JWT (future work).
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: TokenPayload }>();
    const email = request.user?.email?.toLowerCase();
    const admins = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!email || !admins.includes(email)) {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}
