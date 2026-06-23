import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiQuery, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
  CreateReservationDto,
  UpdateReservationDto,
} from '../../application/dto/reservation.dto';
import { OutboxService } from '../../../sync/outbox/outbox.service';

type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'arrived'
  | 'no_show'
  | 'cancelled';

@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  @Get()
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Filter by date YYYY-MM-DD',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'confirmed', 'arrived', 'no_show', 'cancelled'],
  })
  @RequirePermission('MANAGE_RESERVATIONS')
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('date') date?: string,
    @Query('status') status?: string,
  ) {
    const [branchId] = user.branchIds;

    let dateFilter: { gte?: Date; lte?: Date } | undefined;
    if (date) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      dateFilter = { gte: dayStart, lte: dayEnd };
    }

    const reservations = await this.prisma.reservation.findMany({
      where: {
        branchId,
        deletedAt: null,
        ...(status && { status: status as ReservationStatus }),
        ...(dateFilter && { dateTime: dateFilter }),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        table: { select: { id: true, label: true, capacity: true } },
      },
      orderBy: { dateTime: 'asc' },
    });

    return toPaginatedResponse(
      reservations,
      reservations.length,
      1,
      reservations.length,
    );
  }

  @Post()
  @RequirePermission('MANAGE_RESERVATIONS')
  async create(
    @Body() dto: CreateReservationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const [branchId] = user.branchIds;
    if (!branchId) throw AppError.notFound('Branch');

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, deletedAt: null },
    });
    if (!customer) throw AppError.notFound('Customer', dto.customerId);

    if (dto.tableId) {
      const table = await this.prisma.table.findFirst({
        where: { id: dto.tableId, branchId, deletedAt: null },
      });
      if (!table) throw AppError.notFound('Table', dto.tableId);

      // Soft conflict check: warn if table already has a non-cancelled reservation within 2h
      const requestedTime = new Date(dto.dateTime);
      const windowStart = new Date(
        requestedTime.getTime() - 2 * 60 * 60 * 1000,
      );
      const windowEnd = new Date(requestedTime.getTime() + 2 * 60 * 60 * 1000);
      const conflict = await this.prisma.reservation.findFirst({
        where: {
          tableId: dto.tableId,
          deletedAt: null,
          status: { notIn: ['cancelled', 'no_show'] },
          dateTime: { gte: windowStart, lte: windowEnd },
        },
      });
      if (conflict) {
        throw AppError.duplicate(
          'Reservation',
          `Table already reserved at ${conflict.dateTime.toISOString()} (within 2h window)`,
        );
      }
    }

    const reservation = await this.prisma.reservation.create({
      data: {
        branchId,
        customerId: dto.customerId,
        tableId: dto.tableId,
        dateTime: new Date(dto.dateTime),
        partySize: dto.partySize,
        notes: dto.notes,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        table: { select: { id: true, label: true } },
      },
    });

    return toResponse(reservation);
  }

  @Get(':id')
  @RequirePermission('MANAGE_RESERVATIONS')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, branchId: { in: user.branchIds }, deletedAt: null },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            loyaltyPoints: {
              select: { points: true },
            },
          },
        },
        table: { select: { id: true, label: true, capacity: true } },
      },
    });
    if (!reservation) throw AppError.notFound('Reservation', id);

    const loyaltyBalance =
      reservation.customer.loyaltyPoints?.reduce(
        (acc, lp) => acc + lp.points,
        0,
      ) ?? 0;

    return toResponse({
      ...reservation,
      customer: { ...reservation.customer, loyaltyBalance },
    });
  }

  @Patch(':id')
  @RequirePermission('MANAGE_RESERVATIONS')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReservationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const existing = await this.prisma.reservation.findFirst({
      where: { id, branchId: { in: user.branchIds }, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Reservation', id);
    if (existing.version !== dto.version)
      throw AppError.staleData('Reservation', id);
    if (['cancelled', 'arrived', 'no_show'].includes(existing.status)) {
      throw AppError.duplicate(
        'Reservation',
        `cannot update — status is ${existing.status}`,
      );
    }

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: {
        ...(dto.tableId !== undefined && { tableId: dto.tableId }),
        ...(dto.dateTime && { dateTime: new Date(dto.dateTime) }),
        ...(dto.partySize && { partySize: dto.partySize }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        version: { increment: 1 },
      },
    });
    return toResponse(updated);
  }

  @Patch(':id/confirm')
  @RequirePermission('MANAGE_RESERVATIONS')
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { version: number },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.transition(id, 'confirmed', ['pending'], body.version, user);
  }

  @Patch(':id/arrive')
  @RequirePermission('MANAGE_RESERVATIONS')
  async arrive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { version: number },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.transition(
      id,
      'arrived',
      ['confirmed', 'pending'],
      body.version,
      user,
    );
  }

  @Patch(':id/no-show')
  @RequirePermission('MANAGE_RESERVATIONS')
  async noShow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { version: number },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.transition(
      id,
      'no_show',
      ['pending', 'confirmed'],
      body.version,
      user,
    );
  }

  @Patch(':id/cancel')
  @RequirePermission('MANAGE_RESERVATIONS')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { version: number },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.transition(
      id,
      'cancelled',
      ['pending', 'confirmed'],
      body.version,
      user,
    );
  }

  @Delete(':id')
  @RequirePermission('MANAGE_RESERVATIONS')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const existing = await this.prisma.reservation.findFirst({
      where: { id, branchId: { in: user.branchIds }, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Reservation', id);

    await this.prisma.reservation.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return toResponse({ deleted: true });
  }

  private async transition(
    id: string,
    toStatus: ReservationStatus,
    allowedFrom: ReservationStatus[],
    version: number,
    user: CurrentUserPayload,
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, branchId: { in: user.branchIds }, deletedAt: null },
    });
    if (!reservation) throw AppError.notFound('Reservation', id);
    if (!allowedFrom.includes(reservation.status)) {
      throw AppError.duplicate(
        'Reservation',
        `cannot transition from ${reservation.status} to ${toStatus}`,
      );
    }
    if (reservation.version !== version)
      throw AppError.staleData('Reservation', id);

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: toStatus, version: { increment: 1 } },
    });

    // Forward confirmed/arrived events for remote monitoring
    if (toStatus === 'confirmed' || toStatus === 'arrived') {
      void this.outbox.publish(
        `reservation.${toStatus}`,
        {
          branchId: reservation.branchId,
          reservationId: id,
          customerId: reservation.customerId,
          tableId: reservation.tableId,
          dateTime: reservation.dateTime.toISOString(),
        },
        `outbox:reservation.${toStatus}:${id}:${Date.now()}`,
      );
    }

    return toResponse(updated);
  }
}
