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

class CreateStationDto {
  @ApiProperty({ example: 'Cocina' })
  @IsString()
  name: string;
}

@ApiTags('stations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('stations')
export class StationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('VIEW_MENU')
  async list() {
    const stations = await this.prisma.station.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return toPaginatedResponse(stations, stations.length, 1, stations.length);
  }

  @Post()
  @RequirePermission('MANAGE_MENU_ITEMS')
  async create(@Body() dto: CreateStationDto) {
    const existing = await this.prisma.station.findFirst({
      where: { name: dto.name, deletedAt: null },
    });
    if (existing) throw AppError.duplicate('Station', 'name');

    const station = await this.prisma.station.create({
      data: { name: dto.name },
    });
    return toResponse(station);
  }

  @Delete(':id')
  @RequirePermission('MANAGE_MENU_ITEMS')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const station = await this.prisma.station.findFirst({
      where: { id, deletedAt: null },
    });
    if (!station) throw AppError.notFound('Station', id);

    await this.prisma.station.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });

    return toResponse({ deleted: true });
  }
}
