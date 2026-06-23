import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { AppError } from '../response/app-error';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

interface AuthenticatedRequest {
  user: CurrentUserPayload & { permissions?: string[] };
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw AppError.insufficientPermissions(requiredPermission);

    const hasPermission = await this.prisma.rolePermission.findFirst({
      where: {
        roleId: user.roleId,
        permission: { code: requiredPermission, deletedAt: null },
        role: { deletedAt: null },
      },
    });

    if (!hasPermission) {
      await this.prisma.unauthorizedAttempt.create({
        data: {
          userId: user.sub,
          action: `${context.getClass().name}.${context.getHandler().name}`,
          requiredPermission,
        },
      });
      throw AppError.insufficientPermissions(requiredPermission);
    }

    return true;
  }
}
