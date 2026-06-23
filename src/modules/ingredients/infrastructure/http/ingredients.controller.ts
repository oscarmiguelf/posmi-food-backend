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
import { ApiHeader, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
  toResponse,
  toPaginatedResponse,
} from '../../../../shared/response/api-response';
import { AppError } from '../../../../shared/response/app-error';
import {
  AdjustInventoryDto,
  CreateIngredientDto,
  UpdateIngredientDto,
} from '../../application/dto/ingredient.dto';

@ApiTags('ingredients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('ingredients')
export class IngredientsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  @Get()
  @RequirePermission('MANAGE_INGREDIENTS')
  async list() {
    const ingredients = await this.prisma.ingredient.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return toPaginatedResponse(
      ingredients.map((i) => ({
        ...i,
        unitCost: i.unitCost.toString(),
        stockQuantity: i.stockQuantity.toString(),
        minStock: i.minStock.toString(),
        isLow: new Decimal(i.stockQuantity.toString()).lessThanOrEqualTo(
          new Decimal(i.minStock.toString()),
        ),
      })),
      ingredients.length,
      1,
      ingredients.length,
    );
  }

  @Post()
  @RequirePermission('MANAGE_INGREDIENTS')
  async create(@Body() dto: CreateIngredientDto) {
    const existing = await this.prisma.ingredient.findFirst({
      where: { name: dto.name, deletedAt: null },
    });
    if (existing) throw AppError.duplicate('Ingredient', dto.name);

    const ingredient = await this.prisma.ingredient.create({
      data: {
        name: dto.name,
        unit: dto.unit,
        unitCost: new Decimal(dto.unitCost).toFixed(2),
        stockQuantity: new Decimal(dto.stockQuantity).toFixed(3),
        minStock: new Decimal(dto.minStock).toFixed(3),
      },
    });

    return toResponse({
      ...ingredient,
      unitCost: ingredient.unitCost.toString(),
      stockQuantity: ingredient.stockQuantity.toString(),
      minStock: ingredient.minStock.toString(),
    });
  }

  @Patch(':id')
  @RequirePermission('MANAGE_INGREDIENTS')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    const existing = await this.prisma.ingredient.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Ingredient', id);
    if (existing.version !== dto.version)
      throw AppError.staleData('Ingredient', id);

    const updated = await this.prisma.ingredient.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.unit && { unit: dto.unit }),
        ...(dto.unitCost && { unitCost: new Decimal(dto.unitCost).toFixed(2) }),
        ...(dto.minStock && {
          minStock: new Decimal(dto.minStock).toFixed(3),
        }),
        version: { increment: 1 },
      },
    });

    return toResponse({
      ...updated,
      unitCost: updated.unitCost.toString(),
      stockQuantity: updated.stockQuantity.toString(),
      minStock: updated.minStock.toString(),
    });
  }

  @Delete(':id')
  @RequirePermission('MANAGE_INGREDIENTS')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const existing = await this.prisma.ingredient.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Ingredient', id);

    await this.prisma.ingredient.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });

    return toResponse({ deleted: true });
  }

  @Post(':id/adjustments')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermission('ADJUST_INVENTORY')
  async adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustInventoryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const already = await this.prisma.processedOperation.findUnique({
      where: { idempotencyKey: `adj:${dto.idempotencyKey}` },
    });
    if (already) return toResponse(already.result);

    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, deletedAt: null },
    });
    if (!ingredient) throw AppError.notFound('Ingredient', id);

    const [branchId] = user.branchIds;
    if (!branchId) throw AppError.notFound('Branch');

    const delta = new Decimal(dto.quantityDelta);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ingredient.update({
        where: { id },
        data: {
          stockQuantity: { increment: parseFloat(delta.toFixed(3)) },
          version: { increment: 1 },
        },
      });

      await tx.inventoryMovement.create({
        data: {
          branchId,
          ingredientId: id,
          quantityDelta: delta.toFixed(3),
          reason: dto.reason,
          notes: dto.notes,
        },
      });

      await tx.processedOperation.create({
        data: {
          idempotencyKey: `adj:${dto.idempotencyKey}`,
          result: {
            ingredientId: id,
            quantityDelta: delta.toFixed(3),
            reason: dto.reason,
          },
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return result;
    });

    const newStock = new Decimal(updated.stockQuantity.toString());
    const minStock = new Decimal(updated.minStock.toString());
    if (newStock.lessThanOrEqualTo(minStock)) {
      user.branchIds.forEach((bid) => {
        this.events.emitToBranch(bid, 'ingredient.depleted', {
          ingredientId: id,
          name: ingredient.name,
          stockQuantity: newStock.toFixed(3),
          minStock: minStock.toFixed(3),
        });
      });
    }

    return toResponse({
      ...updated,
      unitCost: updated.unitCost.toString(),
      stockQuantity: updated.stockQuantity.toString(),
      minStock: updated.minStock.toString(),
    });
  }

  @Get(':id/movements')
  @RequirePermission('MANAGE_INGREDIENTS')
  async movements(@Param('id', ParseUUIDPipe) id: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, deletedAt: null },
    });
    if (!ingredient) throw AppError.notFound('Ingredient', id);

    const movements = await this.prisma.inventoryMovement.findMany({
      where: { ingredientId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return toPaginatedResponse(
      movements.map((m) => ({
        ...m,
        quantityDelta: m.quantityDelta.toString(),
      })),
      movements.length,
      1,
      movements.length,
    );
  }
}
