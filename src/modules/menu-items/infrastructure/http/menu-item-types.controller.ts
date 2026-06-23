import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../../shared/guards/permission.guard';
import { RequirePermission } from '../../../../shared/decorators/require-permission.decorator';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  toResponse,
  toPaginatedResponse,
} from '../../../../shared/response/api-response';
import { AppError } from '../../../../shared/response/app-error';

class CreateTypeDto {
  @ApiProperty({ example: 'Bebida' })
  @IsString()
  name: string;
}

@ApiTags('menu-item-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('menu-item-types')
export class MenuItemTypesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('VIEW_MENU')
  async list() {
    const types = await this.prisma.menuItemType.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return toPaginatedResponse(types, types.length, 1, types.length);
  }

  @Post()
  @RequirePermission('MANAGE_MENU_ITEMS')
  async create(@Body() dto: CreateTypeDto) {
    const existing = await this.prisma.menuItemType.findFirst({
      where: { name: dto.name, deletedAt: null },
    });
    if (existing) throw AppError.duplicate('MenuItemType', 'name');

    const type = await this.prisma.menuItemType.create({
      data: { name: dto.name },
    });
    return toResponse(type);
  }

  @Delete(':id')
  @RequirePermission('MANAGE_MENU_ITEMS')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const type = await this.prisma.menuItemType.findFirst({
      where: { id, deletedAt: null },
    });
    if (!type) throw AppError.notFound('MenuItemType', id);

    await this.prisma.menuItemType.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });

    return toResponse({ deleted: true });
  }
}
