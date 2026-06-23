import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiQuery, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import Decimal from 'decimal.js';
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
import {
  CreatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
} from '../../application/dto/purchase-order.dto';
import { ModuleEnabledGuard } from '../../../config/guards/module-enabled.guard';
import { RequireModule } from '../../../config/decorators/require-module.decorator';

@ApiTags('purchase-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard, ModuleEnabledGuard)
@RequireModule('purchasing')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly prisma: PrismaService) {}

  // Must be before /:id to avoid route conflict
  @Get('suggestions')
  @RequirePermission('MANAGE_PURCHASE_ORDERS')
  async suggestions(@CurrentUser() user: CurrentUserPayload) {
    const [branchId] = user.branchIds;

    // Low-stock ingredients
    const ingredients = await this.prisma.ingredient.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Historical consumption per ingredient (last 30 days, reason='sale')
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        branchId: branchId ?? undefined,
        reason: 'sale',
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { ingredientId: true, quantityDelta: true },
    });

    const consumedMap = new Map<string, Decimal>();
    for (const m of movements) {
      const delta = new Decimal(m.quantityDelta.toString()).abs();
      consumedMap.set(
        m.ingredientId,
        (consumedMap.get(m.ingredientId) ?? new Decimal(0)).plus(delta),
      );
    }

    // Last supplier per ingredient (via most recent PurchaseOrderItem)
    const lastPurchases = await this.prisma.purchaseOrderItem.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        purchaseOrder: {
          select: {
            supplierId: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    });
    const lastSupplierMap = new Map<string, { id: string; name: string }>();
    for (const p of lastPurchases) {
      if (!lastSupplierMap.has(p.ingredientId)) {
        lastSupplierMap.set(p.ingredientId, p.purchaseOrder.supplier);
      }
    }

    const suggestions = ingredients
      .map((ing) => {
        const stock = new Decimal(ing.stockQuantity.toString());
        const minStock = new Decimal(ing.minStock.toString());
        const consumed30d = consumedMap.get(ing.id) ?? new Decimal(0);
        const avgDailyConsumption = consumed30d.div(30);

        // Suggest enough for 14 days buffer above minStock
        const targetStock = avgDailyConsumption.times(14).plus(minStock);
        const suggestedOrder = Decimal.max(
          targetStock.minus(stock).toDecimalPlaces(3),
          new Decimal(0),
        );

        return {
          ingredientId: ing.id,
          name: ing.name,
          unit: ing.unit,
          currentStock: stock.toFixed(3),
          minStock: minStock.toFixed(3),
          isLow: stock.lessThanOrEqualTo(minStock),
          consumed30d: consumed30d.toFixed(3),
          avgDailyConsumption: avgDailyConsumption.toFixed(3),
          suggestedOrderQty: suggestedOrder.toFixed(3),
          estimatedCost: new Decimal(ing.unitCost.toString())
            .times(suggestedOrder)
            .toFixed(2),
          lastSupplier: lastSupplierMap.get(ing.id) ?? null,
        };
      })
      .filter((s) => s.isLow || parseFloat(s.suggestedOrderQty) > 0)
      .sort((a, b) => {
        // Low stock first, then sorted by suggested qty desc
        if (a.isLow && !b.isLow) return -1;
        if (!a.isLow && b.isLow) return 1;
        return (
          parseFloat(b.suggestedOrderQty) - parseFloat(a.suggestedOrderQty)
        );
      });

    return toResponse({ suggestions });
  }

  @Get()
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['draft', 'sent', 'received'],
  })
  @ApiQuery({ name: 'supplierId', required: false })
  @RequirePermission('MANAGE_PURCHASE_ORDERS')
  async list(
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        deletedAt: null,
        ...(status && { status: status as 'draft' | 'sent' | 'received' }),
        ...(supplierId && { supplierId }),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return toPaginatedResponse(
      orders.map((o) => ({
        ...o,
        total: o.items
          .reduce(
            (acc, i) =>
              acc.plus(
                new Decimal(i.unitCost.toString()).times(
                  i.quantityOrdered.toString(),
                ),
              ),
            new Decimal(0),
          )
          .toFixed(2),
      })),
      orders.length,
      1,
      orders.length,
    );
  }

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermission('MANAGE_PURCHASE_ORDERS')
  async create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const already = await this.prisma.processedOperation.findUnique({
      where: { idempotencyKey: `po:${dto.idempotencyKey}` },
    });
    if (already) return toResponse(already.result);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, deletedAt: null },
    });
    if (!supplier) throw AppError.notFound('Supplier', dto.supplierId);

    const ingredientIds = dto.items.map((i) => i.ingredientId);
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, deletedAt: null },
    });
    if (ingredients.length !== ingredientIds.length) {
      throw AppError.notFound('Ingredient', 'one or more not found');
    }

    const po = await this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({
        data: {
          supplierId: dto.supplierId,
          createdById: user.sub,
          idempotencyKey: dto.idempotencyKey,
          items: {
            create: dto.items.map((i) => ({
              ingredientId: i.ingredientId,
              quantityOrdered: new Decimal(i.quantityOrdered).toFixed(3),
              unitCost: new Decimal(i.unitCost).toFixed(2),
            })),
          },
        },
        include: {
          supplier: true,
          items: { include: { ingredient: true } },
        },
      });

      await tx.processedOperation.create({
        data: {
          idempotencyKey: `po:${dto.idempotencyKey}`,
          result: { purchaseOrderId: order.id, status: order.status },
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      });

      return order;
    });

    return toResponse(po);
  }

  @Get(':id')
  @RequirePermission('MANAGE_PURCHASE_ORDERS')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: true,
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            ingredient: {
              select: { id: true, name: true, unit: true, unitCost: true },
            },
          },
        },
        goodsReceipts: {
          include: {
            receivedBy: { select: { id: true, name: true } },
            items: {
              include: { ingredient: { select: { name: true, unit: true } } },
            },
          },
        },
      },
    });
    if (!order) throw AppError.notFound('PurchaseOrder', id);

    const total = order.items
      .reduce(
        (acc, i) =>
          acc.plus(
            new Decimal(i.unitCost.toString()).times(
              i.quantityOrdered.toString(),
            ),
          ),
        new Decimal(0),
      )
      .toFixed(2);

    return toResponse({ ...order, total });
  }

  @Patch(':id/send')
  @RequirePermission('MANAGE_PURCHASE_ORDERS')
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { version: number },
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
    });
    if (!order) throw AppError.notFound('PurchaseOrder', id);
    if (order.status !== 'draft')
      throw AppError.duplicate('PurchaseOrder', 'already sent or received');
    if (order.version !== body.version)
      throw AppError.staleData('PurchaseOrder', id);

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'sent', version: { increment: 1 } },
    });
    return toResponse(updated);
  }

  @Post(':id/receive')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermission('MANAGE_PURCHASE_ORDERS')
  async receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceivePurchaseOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const already = await this.prisma.processedOperation.findUnique({
      where: { idempotencyKey: `recv:${dto.idempotencyKey}` },
    });
    if (already) return toResponse(already.result);

    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: true,
      },
    });
    if (!order) throw AppError.notFound('PurchaseOrder', id);
    if (order.status === 'received')
      throw AppError.duplicate('PurchaseOrder', 'already received');
    if (order.status === 'draft')
      throw AppError.duplicate(
        'PurchaseOrder',
        'must be sent before receiving',
      );

    const [branchId] = user.branchIds;
    if (!branchId) throw AppError.notFound('Branch');

    // Build map: ingredientId → { quantityOrdered (from PO), unitCost }
    const poItemMap = new Map(
      order.items.map((i) => [
        i.ingredientId,
        {
          quantityOrdered: new Decimal(i.quantityOrdered.toString()),
          unitCost: new Decimal(i.unitCost.toString()),
        },
      ]),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.create({
        data: {
          purchaseOrderId: id,
          receivedById: user.sub,
          receivedAt: new Date(),
          idempotencyKey: dto.idempotencyKey,
          items: {
            create: dto.items.map((item) => {
              const poItem = poItemMap.get(item.ingredientId);
              if (!poItem)
                throw AppError.notFound('PurchaseOrderItem', item.ingredientId);
              return {
                ingredientId: item.ingredientId,
                quantityOrdered: poItem.quantityOrdered.toFixed(3),
                quantityReceived: new Decimal(item.quantityReceived).toFixed(3),
              };
            }),
          },
        },
        include: { items: true },
      });

      // Update stock and unitCost for each received ingredient
      for (const item of dto.items) {
        const poItem = poItemMap.get(item.ingredientId);
        if (!poItem) continue;
        const received = new Decimal(item.quantityReceived);

        // Update stock + propagate new unit cost from PO
        await tx.ingredient.update({
          where: { id: item.ingredientId },
          data: {
            stockQuantity: { increment: parseFloat(received.toFixed(3)) },
            unitCost: poItem.unitCost.toFixed(2),
            version: { increment: 1 },
          },
        });

        await tx.inventoryMovement.create({
          data: {
            branchId,
            ingredientId: item.ingredientId,
            quantityDelta: received.toFixed(3),
            reason: 'purchase_receipt',
            referenceId: receipt.id,
          },
        });
      }

      // Mark PO as received
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'received', version: { increment: 1 } },
      });

      await tx.processedOperation.create({
        data: {
          idempotencyKey: `recv:${dto.idempotencyKey}`,
          result: {
            purchaseOrderId: id,
            goodsReceiptId: receipt.id,
            itemsReceived: dto.items.length,
          },
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      });

      return receipt;
    });

    return toResponse(result);
  }
}
