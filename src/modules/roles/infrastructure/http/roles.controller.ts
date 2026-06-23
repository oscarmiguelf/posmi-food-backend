import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../../shared/guards/permission.guard';
import { RequirePermission } from '../../../../shared/decorators/require-permission.decorator';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { toPaginatedResponse } from '../../../../shared/response/api-response';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('MANAGE_ROLES')
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      where: { deletedAt: null },
      include: {
        rolePermissions: {
          include: { permission: { select: { id: true, code: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    return toPaginatedResponse(roles, roles.length, 1, roles.length);
  }

  @Get('permissions')
  @RequirePermission('MANAGE_ROLES')
  async listPermissions() {
    const perms = await this.prisma.permission.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
    return toPaginatedResponse(perms, perms.length, 1, perms.length);
  }
}
