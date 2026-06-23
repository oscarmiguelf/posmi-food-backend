import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { EventsGateway } from '../../../../shared/websocket/events.gateway';
import { CreateOrderDto } from '../dto/order.dto';
import { AppError } from '../../../../shared/response/app-error';
import { CurrentUserPayload } from '../../../../shared/decorators/current-user.decorator';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async execute(
    dto: CreateOrderDto,
    branchId: string,
    caller: CurrentUserPayload,
  ) {
    // Idempotency check
    const already = await this.prisma.processedOperation.findUnique({
      where: { idempotencyKey: `order:${dto.idempotencyKey}` },
    });
    if (already) return already.result;

    // Validate all menu items exist and get station routing
    const menuItemIds = dto.items.map((i) => i.menuItemId);
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, deletedAt: null, isAvailable: true },
      include: { menuItemStations: true },
    });

    if (menuItems.length !== menuItemIds.length) {
      throw AppError.notFound('MenuItem');
    }

    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          branchId,
          tableId: dto.tableId,
          customerId: dto.customerId,
          idempotencyKey: dto.idempotencyKey,
          items: {
            create: dto.items.map((item) => {
              const menuItem = menuItemMap.get(item.menuItemId)!;
              // Route to first station of this menu item
              const primaryStation = menuItem.menuItemStations[0];
              if (!primaryStation)
                throw AppError.notFound('Station for', item.menuItemId);

              return {
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                unitPriceWithTax: menuItem.salePriceWithTax,
                stationId: primaryStation.stationId,
                notes: item.notes,
                ...(item.modifiers?.length && {
                  modifiers: {
                    create: item.modifiers.map((m) => ({
                      ingredientName: m.ingredientName,
                      action: m.action,
                    })),
                  },
                }),
              };
            }),
          },
          statusHistory: {
            create: {
              fromStatus: 'open',
              toStatus: 'open',
              changedBy: caller.sub,
            },
          },
        },
        include: {
          items: {
            include: {
              menuItem: { select: { id: true, name: true, category: true } },
              station: { select: { id: true, name: true } },
              modifiers: true,
            },
          },
          table: { select: { id: true, label: true } },
        },
      });

      // Mark table(s) as occupied
      const allTableIds = [dto.tableId, ...(dto.extraTableIds ?? [])].filter(
        (id): id is string => !!id,
      );
      for (const tid of allTableIds) {
        await tx.table.update({
          where: { id: tid },
          data: { status: 'occupied', version: { increment: 1 } },
        });
      }

      // Record merged tables
      if (allTableIds.length > 1) {
        await tx.orderTable.createMany({
          data: allTableIds.map((tableId) => ({
            orderId: created.id,
            tableId,
          })),
        });
      }

      await tx.processedOperation.create({
        data: {
          idempotencyKey: `order:${dto.idempotencyKey}`,
          result: { id: created.id },
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return created;
    });

    // Emit to KDS — grouped by station
    const byStation = new Map<string, typeof order.items>();
    order.items.forEach((item) => {
      const existing = byStation.get(item.stationId) ?? [];
      existing.push(item);
      byStation.set(item.stationId, existing);
    });

    byStation.forEach((items, stationId) => {
      this.events.emitToBranch(branchId, 'order.created', {
        orderId: order.id,
        tableLabel: order.table?.label,
        stationId,
        items: items.map((i) => ({
          name: i.menuItem.name,
          quantity: i.quantity,
          notes: i.notes,
        })),
      });
    });

    return order;
  }
}
