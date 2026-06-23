import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { EventsGateway } from '../../../../shared/websocket/events.gateway';
import { CloseOrderDto } from '../dto/order.dto';
import { AppError } from '../../../../shared/response/app-error';
import { CurrentUserPayload } from '../../../../shared/decorators/current-user.decorator';
import { OutboxService } from '../../../sync/outbox/outbox.service';

@Injectable()
export class CloseOrderUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    orderId: string,
    dto: CloseOrderDto,
    branchId: string,
    caller: CurrentUserPayload,
  ) {
    // Idempotency
    const already = await this.prisma.processedOperation.findUnique({
      where: { idempotencyKey: `close:${dto.idempotencyKey}` },
    });
    if (already) return already.result;

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, branchId, deletedAt: null },
      include: {
        items: { include: { modifiers: true } },
        discounts: true,
        table: true,
      },
    });
    if (!order) throw AppError.notFound('Order', orderId);
    if (order.status === 'closed')
      throw AppError.duplicate('Order', 'already closed');
    if (order.version !== dto.version)
      throw AppError.staleData('Order', orderId);

    // Calculate totals (base price + extra prices)
    const subtotal = order.items.reduce((acc, item) => {
      const baseTotal = new Decimal(item.unitPriceWithTax.toString()).times(
        item.quantity,
      );
      const extrasTotal = item.modifiers
        .filter((m) => m.action === 'add')
        .reduce(
          (sum, m) =>
            sum.plus(new Decimal(m.extraPrice.toString()).times(item.quantity)),
          new Decimal(0),
        );
      return acc.plus(baseTotal).plus(extrasTotal);
    }, new Decimal(0));

    const discountTotal = order.discounts.reduce(
      (acc, d) => acc.plus(new Decimal(d.value.toString())),
      new Decimal(0),
    );

    const total = Decimal.max(subtotal.minus(discountTotal), new Decimal(0));

    const paymentTotal = dto.payments.reduce(
      (acc, p) => acc.plus(new Decimal(p.amount)),
      new Decimal(0),
    );

    if (paymentTotal.lessThan(total)) {
      throw new Error(
        `Payment amount ${paymentTotal.toFixed(2)} is less than order total ${total.toFixed(2)}`,
      );
    }

    // Load recipes for inventory decrement
    const menuItemIds = [...new Set(order.items.map((i) => i.menuItemId))];
    const recipes = await this.prisma.recipe.findMany({
      where: { menuItemId: { in: menuItemIds }, deletedAt: null },
      include: {
        recipeItems: {
          where: { deletedAt: null },
          include: {
            ingredient: { select: { id: true, name: true, minStock: true } },
          },
        },
      },
    });
    const recipeByMenuItemId = new Map(recipes.map((r) => [r.menuItemId, r]));

    // Aggregate how much of each ingredient to decrement
    const decrements = new Map<
      string,
      { name: string; qty: Decimal; minStock: Decimal }
    >();
    for (const item of order.items) {
      const recipe = recipeByMenuItemId.get(item.menuItemId);
      if (!recipe) continue;
      for (const ri of recipe.recipeItems) {
        const qty = new Decimal(ri.quantity.toString()).times(item.quantity);
        const existing = decrements.get(ri.ingredientId);
        if (existing) {
          existing.qty = existing.qty.plus(qty);
        } else {
          decrements.set(ri.ingredientId, {
            name: ri.ingredient.name,
            qty,
            minStock: new Decimal(ri.ingredient.minStock.toString()),
          });
        }
      }
    }

    // Resolve all table IDs (including merged) before transaction
    const orderTablesJoined = await this.prisma.orderTable.findMany({
      where: { orderId },
    });
    const allTableIds =
      orderTablesJoined.length > 0
        ? orderTablesJoined.map((ot) => ot.tableId)
        : order.tableId
          ? [order.tableId]
          : [];

    const depletedIngredients: {
      id: string;
      name: string;
      stock: string;
      minStock: string;
    }[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const closed = await tx.order.update({
        where: { id: orderId },
        data: { status: 'closed', version: { increment: 1 } },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: 'closed',
          changedBy: caller.sub,
        },
      });

      // Free all tables (including merged)
      for (const tid of allTableIds) {
        await tx.table.update({
          where: { id: tid },
          data: { status: 'free', version: { increment: 1 } },
        });
      }

      // Register cash movements if session provided
      if (dto.cashSessionId) {
        await tx.cashMovement.createMany({
          data: dto.payments.map((p) => ({
            sessionId: dto.cashSessionId!,
            type: 'sale' as const,
            amount: new Decimal(p.amount).toFixed(2),
            paymentMethod: p.paymentMethod,
            referenceId: orderId,
            idempotencyKey: `cash:${dto.idempotencyKey}:${p.paymentMethod}`,
          })),
        });
      }

      // Decrement ingredient stock for every recipe item consumed
      for (const [ingredientId, { name, qty, minStock }] of decrements) {
        const updated = await tx.ingredient.update({
          where: { id: ingredientId },
          data: {
            stockQuantity: { decrement: parseFloat(qty.toFixed(3)) },
            version: { increment: 1 },
          },
        });

        await tx.inventoryMovement.create({
          data: {
            branchId,
            ingredientId,
            quantityDelta: qty.negated().toFixed(3),
            reason: 'sale',
            referenceId: orderId,
          },
        });

        const newStock = new Decimal(updated.stockQuantity.toString());
        if (newStock.lessThanOrEqualTo(minStock)) {
          depletedIngredients.push({
            id: ingredientId,
            name,
            stock: newStock.toFixed(3),
            minStock: minStock.toFixed(3),
          });
        }
      }

      // LoyaltyPoints: 1 point per $10 MXN of the order total
      if (order.customerId) {
        const pointsEarned = Math.floor(total.div(10).toNumber());
        if (pointsEarned > 0) {
          await tx.loyaltyPoints.create({
            data: {
              customerId: order.customerId,
              orderId,
              points: pointsEarned,
            },
          });
        }
      }

      await tx.processedOperation.create({
        data: {
          idempotencyKey: `close:${dto.idempotencyKey}`,
          result: {
            orderId,
            total: total.toFixed(2),
            status: 'closed',
            pointsEarned: order.customerId
              ? Math.floor(total.div(10).toNumber())
              : 0,
          },
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Outbox: forward order.closed to Cloud for remote monitoring
      await this.outbox.publish(
        'order.closed',
        {
          branchId,
          orderId,
          tableId: order.tableId,
          tableLabel: order.table?.label,
          total: total.toFixed(2),
        },
        `outbox:order.closed:${dto.idempotencyKey}`,
        tx,
      );

      return {
        ...closed,
        total: total.toFixed(2),
        subtotal: subtotal.toFixed(2),
        discountTotal: discountTotal.toFixed(2),
        pointsEarned: order.customerId
          ? Math.floor(total.div(10).toNumber())
          : 0,
      };
    });

    // Emit ingredient.depleted for any stock that hit or went below minimum
    for (const ing of depletedIngredients) {
      this.events.emitToBranch(branchId, 'ingredient.depleted', {
        ingredientId: ing.id,
        name: ing.name,
        stockQuantity: ing.stock,
        minStock: ing.minStock,
      });
    }

    // Emit events
    this.events.emitToBranch(branchId, 'order.closed', {
      orderId,
      tableId: order.tableId,
      tableLabel: order.table?.label,
      total: total.toFixed(2),
    });

    for (const tid of allTableIds) {
      this.events.emitToBranch(branchId, 'table.status_changed', {
        tableId: tid,
        status: 'free',
      });
    }

    return result;
  }
}
