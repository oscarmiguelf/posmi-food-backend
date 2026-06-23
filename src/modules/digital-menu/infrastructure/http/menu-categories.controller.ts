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
import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../../shared/guards/permission.guard';
import { RequirePermission } from '../../../../shared/decorators/require-permission.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../../shared/decorators/current-user.decorator';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  toResponse,
  toPaginatedResponse,
} from '../../../../shared/response/api-response';
import { AppError } from '../../../../shared/response/app-error';

class CreateMenuCategoryDto {
  @ApiProperty({ example: 'Bebidas' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  displayOrder?: number;
}

class UpdateMenuCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}

class ReorderDto {
  @ApiProperty({ type: [Object] })
  items: { id: string; displayOrder: number }[];
}

@ApiTags('menu-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('menu-categories')
export class MenuCategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('VIEW_MENU')
  async list(@CurrentUser() user: CurrentUserPayload) {
    const [branchId] = user.branchIds;
    const categories = await this.prisma.menuCategory.findMany({
      where: { branchId, deletedAt: null },
      include: {
        menuItems: {
          where: { deletedAt: null },
          select: { id: true, name: true, isAvailable: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });
    return toPaginatedResponse(
      categories,
      categories.length,
      1,
      categories.length,
    );
  }

  @Post()
  @RequirePermission('MANAGE_MENU_ITEMS')
  async create(
    @Body() dto: CreateMenuCategoryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const [branchId] = user.branchIds;
    if (!branchId) throw AppError.notFound('Branch');

    const maxOrder = await this.prisma.menuCategory.aggregate({
      where: { branchId, deletedAt: null },
      _max: { displayOrder: true },
    });

    const category = await this.prisma.menuCategory.create({
      data: {
        branchId,
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        displayOrder: dto.displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1,
      },
    });
    return toResponse(category);
  }

  @Patch(':id')
  @RequirePermission('MANAGE_MENU_ITEMS')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuCategoryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const [branchId] = user.branchIds;
    const existing = await this.prisma.menuCategory.findFirst({
      where: { id, branchId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('MenuCategory', id);

    const updated = await this.prisma.menuCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.isVisible !== undefined && { isVisible: dto.isVisible }),
        version: { increment: 1 },
      },
    });
    return toResponse(updated);
  }

  @Patch('reorder')
  @RequirePermission('MANAGE_MENU_ITEMS')
  async reorder(@Body() dto: ReorderDto) {
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.menuCategory.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    return toResponse({ reordered: dto.items.length });
  }

  @Delete(':id')
  @RequirePermission('MANAGE_MENU_ITEMS')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const [branchId] = user.branchIds;
    const existing = await this.prisma.menuCategory.findFirst({
      where: { id, branchId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('MenuCategory', id);

    await this.prisma.menuCategory.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return toResponse({ deleted: true });
  }
}
