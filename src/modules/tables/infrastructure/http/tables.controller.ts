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
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { EventsGateway } from '../../../../shared/websocket/events.gateway';
import {
  CreateTableDto,
  UpdateTableStatusDto,
} from '../../application/dto/table.dto';
import {
  toResponse,
  toPaginatedResponse,
} from '../../../../shared/response/api-response';
import { AppError } from '../../../../shared/response/app-error';

@ApiTags('tables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('tables')
export class TablesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  @Get()
  @RequirePermission('VIEW_TABLES')
  async list(@CurrentUser() user: CurrentUserPayload) {
    const tables = await this.prisma.table.findMany({
      where: {
        branch: { companyId: user.companyId },
        branchId: { in: user.branchIds },
        deletedAt: null,
      },
      orderBy: [{ branchId: 'asc' }, { label: 'asc' }],
    });
    return toPaginatedResponse(tables, tables.length, 1, tables.length);
  }

  @Post()
  @RequirePermission('MANAGE_USERS')
  async create(
    @Body() dto: CreateTableDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const [branchId] = user.branchIds;
    if (!branchId) throw AppError.notFound('Branch');

    const table = await this.prisma.table.create({
      data: { label: dto.label, capacity: dto.capacity, branchId },
    });
    return toResponse(table);
  }

  @Patch(':id/status')
  @RequirePermission('MANAGE_TABLE_STATUS')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const table = await this.prisma.table.findFirst({
      where: { id, branchId: { in: user.branchIds }, deletedAt: null },
    });
    if (!table) throw AppError.notFound('Table', id);
    if (table.version !== dto.version) throw AppError.staleData('Table', id);

    const updated = await this.prisma.table.update({
      where: { id },
      data: { status: dto.status, version: { increment: 1 } },
    });

    this.events.emitToBranch(table.branchId, 'table.status_changed', {
      tableId: id,
      label: updated.label,
      status: updated.status,
    });

    return toResponse(updated);
  }

  @Delete(':id')
  @RequirePermission('MANAGE_USERS')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const table = await this.prisma.table.findFirst({
      where: { id, branchId: { in: user.branchIds }, deletedAt: null },
    });
    if (!table) throw AppError.notFound('Table', id);

    await this.prisma.table.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });

    return toResponse({ deleted: true });
  }
}
