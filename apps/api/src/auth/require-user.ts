import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService, RequestUser } from './auth.service';

export async function requireUser(auth: AuthService, cookie: string | undefined, communityId?: string) {
  const user = await auth.userFromCookie(cookie);
  if (communityId && user.communityId !== communityId) throw new UnauthorizedException('Invalid community scope.');
  return user;
}

export async function requireAdmin(auth: AuthService, cookie: string | undefined, communityId: string): Promise<RequestUser> {
  const user = await requireUser(auth, cookie, communityId);
  if (!['owner', 'admin'].includes(user.role)) throw new ForbiddenException('Admin access required.');
  return user;
}
