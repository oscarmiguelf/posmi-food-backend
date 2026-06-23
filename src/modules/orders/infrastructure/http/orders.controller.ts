import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../../shared/guards/permission.guard';
import { RequirePermission } from '../../../../shared/decorators/require-permission.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../../shared/decorators/current-user.decorator';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { EventsGateway } from '../../../../shared/websocket/events.gateway';
import { CreateOrderUseCase } from '../../application/use-cases/create-order.use-case';
import { CloseOrderUseCase } from '../../application/use-cases/close-order.use-case';
import {
  AddOrderItemDto,
  ApplyDiscountDto,
  CloseOrderDto,
  CreateOrderDto,
  UpdateOrderStatusDto,
} from '../../application/dto/order.dto';
import {
  toResponse,
  toPaginatedResponse,
} from '../../../../shared/response/api-response';
import { AppError } from '../../../../shared/response/app-error';
import Decimal from 'decimal.js';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly createOrder: CreateOrderUseCase,
    private readonly closeOrder: CloseOrderUseCase,
  ) {}

  @Get()
  @RequirePermission('VIEW_TABLES')
  async list(@CurrentUser() user: CurrentUserPayload) {
    const orders = await this.prisma.order.findMany({
      where: {
        branchId: { in: user.branchIds },
        status: { not: 'closed' },
        deletedAt: null,
      },
      include: {
        table: { select: { id: true, label: true } },
        items: {
          include: {
            menuItem: { select: { id: true, name: true } },
            station: { select: { id: true, name: true } },
            modifiers: true,
          },
        },
        discounts: true,
        orderTables: {
          include: { table: { select: { id: true, label: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return toPaginatedResponse(orders, orders.length, 1, orders.length);
  }

  @Get(':id')
  @RequirePermission('VIEW_TABLES')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, branchId: { in: user.branchIds }, deletedAt: null },
      include: {
        table: true,
        items: { include: { menuItem: true, station: true, modifiers: true } },
        discounts: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        orderTables: {
          include: { table: { select: { id: true, label: true } } },
        },
      },
    });
    if (!order) throw AppError.notFound('Order', id);
    return toResponse(order);
  }

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermission('CREATE_ORDER')
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const [branchId] = user.branchIds;
    if (!branchId) throw AppError.notFound('Branch');
    return toResponse(await this.createOrder.execute(dto, branchId, user));
  }

  @Post(':id/items')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermission('ADD_ORDER_ITEM')
  async addItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOrderItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, branchId: { in: user.branchIds }, deletedAt: null },
    });
    if (!order) throw AppError.notFound('Order', id);
    if (order.status === 'closed')
      throw AppError.duplicate('Order', 'closed — cannot add items');

    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: dto.items.map((i) => i.menuItemId) },
        deletedAt: null,
        isAvailable: true,
      },
      include: { menuItemStations: true },
    });

    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

    const newItems = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orderItem.createMany({
        data: dto.items.map((item) => {
          const menuItem = menuItemMap.get(item.menuItemId);
          if (!menuItem) throw AppError.notFound('MenuItem', item.menuItemId);
          const primaryStation = menuItem.menuItemStations[0];
          if (!primaryStation) throw AppError.notFound('Station');
          return {
            orderId: id,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            unitPriceWithTax: menuItem.salePriceWithTax,
            stationId: primaryStation.stationId,
            notes: item.notes,
          };
        }),
      });

      await tx.processedOperation.upsert({
        where: { idempotencyKey: `add-items:${dto.idempotencyKey}` },
        update: {},
        create: {
          idempotencyKey: `add-items:${dto.idempotencyKey}`,
          result: { count: created.count },
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return created;
    });

    this.events.emitToBranch(order.branchId, 'order.item_added', {
      orderId: id,
      tableId: order.tableId,
      items: dto.items,
    });

    return toResponse({ addedCount: newItems.count });
  }

  @Patch(':id/status')
  @RequirePermission('CHANGE_ORDER_STATUS')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, branchId: { in: user.branchIds }, deletedAt: null },
    });
    if (!order) throw AppError.notFound('Order', id);
    if (order.version !== dto.version) throw AppError.staleData('Order', id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id },
        data: { status: dto.status, version: { increment: 1 } },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: dto.status,
          changedBy: user.sub,
        },
      });
      return u;
    });

    const eventName =
      dto.status === 'ready' ? 'order.ready' : 'order.status_changed';
    this.events.emitToBranch(order.branchId, eventName, {
      orderId: id,
      tableId: order.tableId,
      status: dto.status,
    });

    return toResponse(updated);
  }

  @Post(':id/discounts')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermission('APPLY_DISCOUNT')
  async applyDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyDiscountDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const already = await this.prisma.processedOperation.findUnique({
      where: { idempotencyKey: `discount:${dto.idempotencyKey}` },
    });
    if (already) return toResponse(already.result);

    const order = await this.prisma.order.findFirst({
      where: { id, branchId: { in: user.branchIds }, deletedAt: null },
    });
    if (!order) throw AppError.notFound('Order', id);
    if (order.status === 'closed')
      throw AppError.duplicate('Order', 'already closed');

    const discount = await this.prisma.$transaction(async (tx) => {
      const d = await tx.discount.create({
        data: {
          orderId: dto.scope === 'order' ? id : undefined,
          orderItemId: dto.scope === 'line' ? dto.orderItemId : undefined,
          type: dto.type,
          scope: dto.scope,
          value: new Decimal(dto.value).toFixed(2),
          appliedById: user.sub,
        },
      });

      await tx.auditLog.create({
        data: {
          entityName: 'Discount',
          entityId: d.id,
          action: 'APPLY',
          newValue: {
            orderId: id,
            type: dto.type,
            value: dto.value,
            scope: dto.scope,
          },
          userId: user.sub,
          roleAtTime: user.roleName,
        },
      });

      await tx.processedOperation.create({
        data: {
          idempotencyKey: `discount:${dto.idempotencyKey}`,
          result: { discountId: d.id },
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return d;
    });

    return toResponse({ ...discount, value: discount.value.toString() });
  }

  @Post(':id/close')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermission('COLLECT_PAYMENT')
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const [branchId] = user.branchIds;
    return toResponse(await this.closeOrder.execute(id, dto, branchId, user));
  }

  @Get(':id/receipt')
  @RequirePermission('COLLECT_PAYMENT')
  async getReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, branchId: { in: user.branchIds } },
      include: {
        items: {
          include: {
            menuItem: { select: { id: true, name: true, category: true } },
          },
        },
        discounts: true,
        table: { select: { label: true } },
        customer: { select: { name: true, phone: true } },
        branch: { select: { name: true } },
      },
    });
    if (!order) throw AppError.notFound('Order', id);

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
    const taxRate = new Decimal('0.16');
    const totalWithoutTax = total.div(taxRate.plus(1));
    const taxAmount = total.minus(totalWithoutTax);

    return toResponse({
      orderId: order.id,
      branchName: order.branch.name,
      tableLabel: order.table?.label,
      customerName: order.customer?.name,
      createdAt: order.createdAt,
      closedAt: order.updatedAt,
      lines: order.items.map((item) => ({
        name: item.menuItem.name,
        category: item.menuItem.category,
        quantity: item.quantity,
        unitPrice: item.unitPriceWithTax.toString(),
        lineTotal: new Decimal(item.unitPriceWithTax.toString())
          .times(item.quantity)
          .toFixed(2),
      })),
      discounts: order.discounts.map((d) => ({
        type: d.type,
        value: d.value.toString(),
        scope: d.scope,
      })),
      subtotal: subtotal.toFixed(2),
      discountTotal: discountTotal.toFixed(2),
      total: total.toFixed(2),
      totalWithoutTax: totalWithoutTax.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      taxRate: taxRate.toString(),
    });
  }
}
