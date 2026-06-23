import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { EventsGateway } from '../../../../shared/websocket/events.gateway';
import { CloseOrderDto } from '../dto/order.dto';
import { AppError } from '../../../../shared/response/app-error';
import { CurrentUserPayload } from '../../../../shared/decorators/current-user.decorator';

@Injectable()
export class CloseOrderUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
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
        items: true,
        discounts: true,
        table: true,
      },
    });
    if (!order) throw AppError.notFound('Order', orderId);
    if (order.status === 'closed')
      throw AppError.duplicate('Order', 'already closed');
    if (order.version !== dto.version)
      throw AppError.staleData('Order', orderId);

    // Calculate totals
    const subtotal = order.items.reduce(
      (acc, item) =>
        acc.plus(
          new Decimal(item.unitPriceWithTax.toString()).times(item.quantity),
        ),
      new Decimal(0),
    );

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

      // Free the table
      if (order.tableId) {
        await tx.table.update({
          where: { id: order.tableId },
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

      await tx.processedOperation.create({
        data: {
          idempotencyKey: `close:${dto.idempotencyKey}`,
          result: { orderId, total: total.toFixed(2), status: 'closed' },
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return {
        ...closed,
        total: total.toFixed(2),
        subtotal: subtotal.toFixed(2),
        discountTotal: discountTotal.toFixed(2),
      };
    });

    // Emit events
    this.events.emitToBranch(branchId, 'order.closed', {
      orderId,
      tableId: order.tableId,
      tableLabel: order.table?.label,
      total: total.toFixed(2),
    });

    if (order.tableId) {
      this.events.emitToBranch(branchId, 'table.status_changed', {
        tableId: order.tableId,
        status: 'free',
      });
    }

    return result;
  }
}
