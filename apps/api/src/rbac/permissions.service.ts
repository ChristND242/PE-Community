import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service';
import { RequestUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { Permission, getSystemRolePermissions } from './permissions';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogs: AuditLogService) {}

  getUserPermissions(user: Pick<RequestUser, 'role'> & { permissions?: string[] | null }): Permission[] {
    if (user.permissions) return user.permissions as Permission[];
    return getSystemRolePermissions(user.role);
  }

  hasPermission(user: Pick<RequestUser, 'role'> & { permissions?: string[] | null }, permission: Permission) {
    return this.getUserPermissions(user).includes(permission);
  }

  async requirePermission(user: Pick<RequestUser, 'id' | 'role'> & { permissions?: string[] | null }, permission: Permission, communityId: string) {
    if (this.hasPermission(user, permission)) return;
    await this.auditLogs.recordBestEffort({
      communityId,
      actorUserId: user.id,
      actorRole: user.role,
      category: 'AUTHORIZATION',
      action: 'roles.permission.denied',
      outcome: 'DENIED',
      severity: 'HIGH',
      targetType: 'Permission',
      targetId: permission,
      reason: 'MISSING_PERMISSION',
      metadata: { permission },
    });
    throw new ForbiddenException('You do not have permission to perform this action.');
  }
}
