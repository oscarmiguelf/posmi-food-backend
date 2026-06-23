import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../../shared/guards/permission.guard';
import { RequirePermission } from '../../../../shared/decorators/require-permission.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../../shared/decorators/current-user.decorator';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { CreateUserDto, UpdateUserDto } from '../../application/dto/user.dto';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  toResponse,
  toPaginatedResponse,
} from '../../../../shared/response/api-response';
import { AppError } from '../../../../shared/response/app-error';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermission('MANAGE_USERS')
  async list(@CurrentUser() user: CurrentUserPayload) {
    const users = await this.prisma.user.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        role: { select: { id: true, name: true } },
        userBranches: { select: { branchId: true } },
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
    return toPaginatedResponse(users, users.length, 1, users.length);
  }

  @Post()
  @RequirePermission('MANAGE_USERS')
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return toResponse(await this.createUser.execute(dto, user));
  }

  @Patch(':id')
  @RequirePermission('MANAGE_USERS')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() caller: CurrentUserPayload,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { id, companyId: caller.companyId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('User', id);
    if (existing.version !== (dto.version ?? existing.version))
      throw AppError.staleData('User', id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: {
          name: dto.name,
          roleId: dto.roleId,
          isActive: dto.isActive,
          version: { increment: 1 },
        },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          roleId: true,
          version: true,
        },
      });

      if (dto.branchIds !== undefined) {
        await tx.userBranch.deleteMany({ where: { userId: id } });
        if (dto.branchIds.length > 0) {
          await tx.userBranch.createMany({
            data: dto.branchIds.map((branchId) => ({ userId: id, branchId })),
          });
        }
      }

      await tx.auditLog.create({
        data: {
          entityName: 'User',
          entityId: id,
          action: 'UPDATE',
          oldValue: {
            name: existing.name,
            roleId: existing.roleId,
            isActive: existing.isActive,
          },
          newValue: {
            name: dto.name,
            roleId: dto.roleId,
            isActive: dto.isActive,
          },
          userId: caller.sub,
          roleAtTime: caller.roleName,
        },
      });

      return u;
    });

    return toResponse(updated);
  }

  @Delete(':id')
  @RequirePermission('MANAGE_USERS')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: CurrentUserPayload,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { id, companyId: caller.companyId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('User', id);
    if (existing.id === caller.sub)
      throw AppError.duplicate('User', 'cannot delete yourself');

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });

    return toResponse({ deleted: true });
  }
}
