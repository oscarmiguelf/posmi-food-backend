import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { IsNumberString, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { OutboxService } from '../../../sync/outbox/outbox.service';

class OpenCashSessionDto {
  @ApiProperty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ example: '500.00' })
  @IsNumberString()
  openingAmount: string;
}

class RegisterMovementDto {
  @ApiProperty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ enum: ['payin', 'payout'] })
  @IsString()
  type: 'payin' | 'payout';

  @ApiProperty()
  @IsNumberString()
  amount: string;

  @ApiProperty({ enum: ['cash', 'card', 'transfer'] })
  @IsString()
  paymentMethod: 'cash' | 'card' | 'transfer';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

class CloseCashSessionDto {
  @ApiProperty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ description: 'Monto declarado por el cajero al cerrar' })
  @IsNumberString()
  closingAmountDeclared: string;
}

@ApiTags('cash-sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('cash-sessions')
export class CashSessionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly outbox: OutboxService,
  ) {}

  @Get()
  @RequirePermission('VIEW_FINANCIAL_REPORTS')
  async list(@CurrentUser() user: CurrentUserPayload) {
    const sessions = await this.prisma.cashRegisterSession.findMany({
      where: { branchId: { in: user.branchIds }, deletedAt: null },
      include: { cashier: { select: { id: true, name: true } } },
      orderBy: { openedAt: 'desc' },
      take: 50,
    });
    return toPaginatedResponse(sessions, sessions.length, 1, sessions.length);
  }

  @Post('open')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermission('OPEN_CASH_SESSION')
  async open(
    @Body() dto: OpenCashSessionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const [branchId] = user.branchIds;
    if (!branchId) throw AppError.notFound('Branch');

    const openSession = await this.prisma.cashRegisterSession.findFirst({
      where: { branchId, cashierId: user.sub, closedAt: null, deletedAt: null },
    });
    if (openSession)
      return toResponse({
        message: 'Session already open',
        sessionId: openSession.id,
      });

    const session = await this.prisma.cashRegisterSession.create({
      data: {
        branchId,
        cashierId: user.sub,
        openedAt: new Date(),
        openingAmount: new Decimal(dto.openingAmount).toFixed(2),
        idempotencyKey: dto.idempotencyKey,
      },
    });

    this.events.emitToBranch(branchId, 'cash_session.opened', {
      sessionId: session.id,
      cashierId: user.sub,
    });

    void this.outbox.publish(
      'cash_session.opened',
      { branchId, sessionId: session.id, cashierId: user.sub },
      `outbox:cash_session.opened:${dto.idempotencyKey}`,
    );

    return toResponse(session);
  }

  @Post(':id/movements')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermission('REGISTER_CASH_MOVEMENT')
  async registerMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterMovementDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const already = await this.prisma.processedOperation.findUnique({
      where: { idempotencyKey: `movement:${dto.idempotencyKey}` },
    });
    if (already) return toResponse(already.result);

    const session = await this.prisma.cashRegisterSession.findFirst({
      where: {
        id,
        branchId: { in: user.branchIds },
        closedAt: null,
        deletedAt: null,
      },
    });
    if (!session) throw AppError.notFound('CashRegisterSession', id);

    const movement = await this.prisma.$transaction(async (tx) => {
      const m = await tx.cashMovement.create({
        data: {
          sessionId: id,
          type: dto.type,
          amount: new Decimal(dto.amount).toFixed(2),
          paymentMethod: dto.paymentMethod,
          notes: dto.notes,
          idempotencyKey: dto.idempotencyKey,
        },
      });

      await tx.processedOperation.create({
        data: {
          idempotencyKey: `movement:${dto.idempotencyKey}`,
          result: { movementId: m.id },
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return m;
    });

    return toResponse(movement);
  }

  @Post(':id/close')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermission('CLOSE_CASH_SESSION')
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCashSessionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const already = await this.prisma.processedOperation.findUnique({
      where: { idempotencyKey: `close-session:${dto.idempotencyKey}` },
    });
    if (already) return toResponse(already.result);

    const session = await this.prisma.cashRegisterSession.findFirst({
      where: {
        id,
        branchId: { in: user.branchIds },
        closedAt: null,
        deletedAt: null,
      },
      include: { cashMovements: true },
    });
    if (!session) throw AppError.notFound('CashRegisterSession', id);

    // Calculate system closing amount
    const systemAmount = session.cashMovements.reduce((acc, m) => {
      const amount = new Decimal(m.amount.toString());
      return m.type === 'sale' || m.type === 'payin'
        ? acc.plus(amount)
        : acc.minus(amount);
    }, new Decimal(session.openingAmount.toString()));

    const closed = await this.prisma.$transaction(async (tx) => {
      const c = await tx.cashRegisterSession.update({
        where: { id },
        data: {
          closedAt: new Date(),
          closingAmountDeclared: new Decimal(dto.closingAmountDeclared).toFixed(
            2,
          ),
          closingAmountSystem: systemAmount.toFixed(2),
          version: { increment: 1 },
        },
      });

      await tx.processedOperation.create({
        data: {
          idempotencyKey: `close-session:${dto.idempotencyKey}`,
          result: {
            sessionId: id,
            systemAmount: systemAmount.toFixed(2),
            closedAt: c.closedAt,
          },
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return c;
    });

    const closePayload = {
      branchId: session.branchId,
      sessionId: id,
      systemAmount: systemAmount.toFixed(2),
      declaredAmount: dto.closingAmountDeclared,
      difference: new Decimal(dto.closingAmountDeclared)
        .minus(systemAmount)
        .toFixed(2),
    };
    this.events.emitToBranch(
      session.branchId,
      'cash_session.closed',
      closePayload,
    );

    void this.outbox.publish(
      'cash_session.closed',
      closePayload,
      `outbox:cash_session.closed:${dto.idempotencyKey}`,
    );

    return toResponse(closed);
  }

  @Get(':id/report')
  @RequirePermission('VIEW_FINANCIAL_REPORTS')
  async report(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const session = await this.prisma.cashRegisterSession.findFirst({
      where: { id, branchId: { in: user.branchIds }, deletedAt: null },
      include: {
        cashier: { select: { id: true, name: true } },
        cashMovements: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) throw AppError.notFound('CashRegisterSession', id);

    const salesMvts = session.cashMovements.filter((m) => m.type === 'sale');
    const payinMvts = session.cashMovements.filter((m) => m.type === 'payin');
    const payoutMvts = session.cashMovements.filter((m) => m.type === 'payout');

    const sum = (list: typeof salesMvts) =>
      list.reduce(
        (acc, m) => acc.plus(new Decimal(m.amount.toString())),
        new Decimal(0),
      );

    const salesTotal = sum(salesMvts);
    const payinsTotal = sum(payinMvts);
    const payoutsTotal = sum(payoutMvts);

    // Group by payment method
    const byMethod = new Map<string, Decimal>();
    for (const m of session.cashMovements) {
      byMethod.set(
        m.paymentMethod,
        (byMethod.get(m.paymentMethod) ?? new Decimal(0)).plus(
          new Decimal(m.amount.toString()),
        ),
      );
    }

    // IVA back-calculation (section 3.14) — sales prices always include IVA
    const ivaRate = new Decimal('0.16');
    const netRevenue = salesTotal.div(ivaRate.plus(1)).toDecimalPlaces(2);
    const ivaCollected = salesTotal.minus(netRevenue).toDecimalPlaces(2);

    // Recalculate system closing amount
    const systemClosing = session.cashMovements.reduce((acc, m) => {
      const amount = new Decimal(m.amount.toString());
      return m.type === 'sale' || m.type === 'payin'
        ? acc.plus(amount)
        : acc.minus(amount);
    }, new Decimal(session.openingAmount.toString()));

    return toResponse({
      session: {
        id: session.id,
        cashier: session.cashier,
        openedAt: session.openedAt,
        closedAt: session.closedAt ?? null,
        openingAmount: session.openingAmount.toString(),
        closingAmountDeclared:
          session.closingAmountDeclared?.toString() ?? null,
        closingAmountSystem: systemClosing.toFixed(2),
        difference: session.closingAmountDeclared
          ? new Decimal(session.closingAmountDeclared.toString())
              .minus(systemClosing)
              .toFixed(2)
          : null,
      },
      movements: {
        sales: { count: salesMvts.length, total: salesTotal.toFixed(2) },
        payins: { count: payinMvts.length, total: payinsTotal.toFixed(2) },
        payouts: {
          count: payoutMvts.length,
          total: payoutsTotal.toFixed(2),
        },
      },
      byPaymentMethod: Object.fromEntries(
        Array.from(byMethod.entries()).map(([k, v]) => [k, v.toFixed(2)]),
      ),
      revenue: {
        gross: salesTotal.toFixed(2),
        ivaCollected: ivaCollected.toFixed(2),
        net: netRevenue.toFixed(2),
      },
      totalMovements: session.cashMovements.length,
    });
  }
}
