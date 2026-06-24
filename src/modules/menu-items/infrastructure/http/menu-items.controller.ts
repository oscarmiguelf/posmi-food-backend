import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import Decimal from 'decimal.js';
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
  CreateMenuItemDto,
  UpdateMenuItemDto,
} from '../../application/dto/menu-item.dto';
import { calculateTaxBreakdown } from '../../domain/entities/tax.calculator';
import {
  toResponse,
  toPaginatedResponse,
} from '../../../../shared/response/api-response';
import { AppError } from '../../../../shared/response/app-error';

@ApiTags('menu-items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('menu-items')
export class MenuItemsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  @Get()
  @RequirePermission('VIEW_MENU')
  async list() {
    const items = await this.prisma.menuItem.findMany({
      where: { deletedAt: null },
      include: {
        menuItemStations: {
          include: { station: { select: { id: true, name: true } } },
        },
        recipe: { select: { id: true } },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    return toPaginatedResponse(
      items.map((item) => ({
        ...item,
        salePriceWithTax: item.salePriceWithTax.toString(),
        stations: item.menuItemStations.map((mis) => mis.station),
        hasRecipe: !!item.recipe,
      })),
      items.length,
      1,
      items.length,
    );
  }

  @Post()
  @RequirePermission('MANAGE_MENU_ITEMS')
  async create(@Body() dto: CreateMenuItemDto) {
    const breakdown = calculateTaxBreakdown(new Decimal(dto.salePriceWithTax));

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.menuItem.create({
        data: {
          name: dto.name,
          category: dto.category,
          salePriceWithTax: breakdown.salePriceWithTax.toFixed(2),
          menuItemStations: {
            create: dto.stationIds.map((stationId) => ({ stationId })),
          },
        },
        include: { menuItemStations: { include: { station: true } } },
      });
      return created;
    });

    return toResponse({
      ...item,
      salePriceWithTax: item.salePriceWithTax.toString(),
      taxBreakdown: {
        priceWithoutTax: breakdown.priceWithoutTax.toFixed(6),
        taxAmount: breakdown.taxAmount.toFixed(6),
        taxRate: breakdown.taxRate.toString(),
      },
    });
  }

  @Patch(':id')
  @RequirePermission('MANAGE_MENU_ITEMS')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const existing = await this.prisma.menuItem.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('MenuItem', id);
    if (existing.version !== dto.version)
      throw AppError.staleData('MenuItem', id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updateData: {
        name?: string;
        category?: string;
        salePriceWithTax?: string;
        isAvailable?: boolean;
        version: { increment: number };
      } = { version: { increment: 1 } };

      if (dto.name) updateData.name = dto.name;
      if (dto.category) updateData.category = dto.category;
      if (dto.isAvailable !== undefined)
        updateData.isAvailable = dto.isAvailable;
      if (dto.salePriceWithTax) {
        updateData.salePriceWithTax = new Decimal(dto.salePriceWithTax).toFixed(
          2,
        );
      }

      const item = await tx.menuItem.update({
        where: { id },
        data: updateData,
      });

      if (dto.stationIds !== undefined) {
        await tx.menuItemStation.deleteMany({ where: { menuItemId: id } });
        if (dto.stationIds.length > 0) {
          await tx.menuItemStation.createMany({
            data: dto.stationIds.map((stationId) => ({
              menuItemId: id,
              stationId,
            })),
          });
        }
      }

      await tx.auditLog.create({
        data: {
          entityName: 'MenuItem',
          entityId: id,
          action: 'UPDATE',
          oldValue: {
            salePriceWithTax: existing.salePriceWithTax,
            isAvailable: existing.isAvailable,
          },
          newValue: {
            salePriceWithTax: dto.salePriceWithTax,
            isAvailable: dto.isAvailable,
          },
          userId: user.sub,
          roleAtTime: user.roleName,
        },
      });

      return item;
    });

    // Notify if availability changed — meseros hide/show item on live menu
    if (
      dto.isAvailable !== undefined &&
      dto.isAvailable !== existing.isAvailable
    ) {
      user.branchIds.forEach((branchId) => {
        this.events.emitToBranch(branchId, 'ingredient.depleted', {
          menuItemId: id,
          name: existing.name,
          isAvailable: dto.isAvailable,
        });
      });
    }

    return toResponse({
      ...updated,
      salePriceWithTax: updated.salePriceWithTax.toString(),
    });
  }

  @Delete(':id')
  @RequirePermission('MANAGE_MENU_ITEMS')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, deletedAt: null },
    });
    if (!item) throw AppError.notFound('MenuItem', id);

    await this.prisma.menuItem.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });

    return toResponse({ deleted: true });
  }

  @Get(':id/recipe')
  @RequirePermission('VIEW_MENU')
  async getRecipe(@Param('id', ParseUUIDPipe) menuItemId: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { menuItemId, deletedAt: null },
      include: {
        recipeItems: {
          where: { deletedAt: null },
          include: {
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        },
      },
    });
    if (!recipe) return toResponse({ items: [] });
    return toResponse({
      id: recipe.id,
      items: recipe.recipeItems.map((ri) => ({
        ingredientId: ri.ingredientId,
        ingredientName: ri.ingredient.name,
        unit: ri.unit,
        quantity: ri.quantity.toString(),
      })),
    });
  }

  @Put(':id/recipe')
  @RequirePermission('MANAGE_RECIPES')
  async upsertRecipe(
    @Param('id', ParseUUIDPipe) menuItemId: string,
    @Body()
    body: { items: { ingredientId: string; quantity: string; unit: string }[] },
  ) {
    const menuItem = await this.prisma.menuItem.findFirst({
      where: { id: menuItemId, deletedAt: null },
    });
    if (!menuItem) throw AppError.notFound('MenuItem', menuItemId);

    const recipe = await this.prisma.$transaction(async (tx) => {
      let r = await tx.recipe.findFirst({
        where: { menuItemId, deletedAt: null },
      });

      if (r) {
        await tx.recipeItem.updateMany({
          where: { recipeId: r.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      } else {
        r = await tx.recipe.create({ data: { menuItemId } });
      }

      await tx.recipeItem.createMany({
        data: body.items.map((i) => ({
          recipeId: r.id,
          ingredientId: i.ingredientId,
          quantity: new Decimal(i.quantity).toFixed(3),
          unit: i.unit,
        })),
      });

      return tx.recipe.findUniqueOrThrow({
        where: { id: r.id },
        include: { recipeItems: { include: { ingredient: true } } },
      });
    });

    return toResponse(recipe);
  }

  @Get(':id/extras')
  @RequirePermission('VIEW_MENU')
  async listExtras(@Param('id', ParseUUIDPipe) id: string) {
    const extras = await this.prisma.menuItemExtra.findMany({
      where: { menuItemId: id, deletedAt: null },
      orderBy: { ingredientName: 'asc' },
    });
    return toResponse(
      extras.map((e) => ({
        ...e,
        priceWithTax: e.priceWithTax.toString(),
      })),
    );
  }

  @Post(':id/extras')
  @RequirePermission('MANAGE_MENU_ITEMS')
  async addExtra(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { ingredientName: string; priceWithTax: string },
  ) {
    const menuItem = await this.prisma.menuItem.findFirst({
      where: { id, deletedAt: null },
    });
    if (!menuItem) throw AppError.notFound('MenuItem', id);

    const extra = await this.prisma.menuItemExtra.create({
      data: {
        menuItemId: id,
        ingredientName: body.ingredientName,
        priceWithTax: new Decimal(body.priceWithTax).toFixed(2),
      },
    });
    return toResponse({
      ...extra,
      priceWithTax: extra.priceWithTax.toString(),
    });
  }

  @Delete(':menuItemId/extras/:extraId')
  @RequirePermission('MANAGE_MENU_ITEMS')
  async removeExtra(
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @Param('extraId', ParseUUIDPipe) extraId: string,
  ) {
    const extra = await this.prisma.menuItemExtra.findFirst({
      where: { id: extraId, menuItemId, deletedAt: null },
    });
    if (!extra) throw AppError.notFound('MenuItemExtra', extraId);

    await this.prisma.menuItemExtra.update({
      where: { id: extraId },
      data: { deletedAt: new Date() },
    });
    return toResponse({ deleted: true });
  }
}
