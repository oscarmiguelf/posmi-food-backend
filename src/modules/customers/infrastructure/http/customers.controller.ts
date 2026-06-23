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
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  toResponse,
  toPaginatedResponse,
} from '../../../../shared/response/api-response';
import { AppError } from '../../../../shared/response/app-error';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
} from '../../application/dto/customer.dto';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, phone or email',
  })
  @RequirePermission('MANAGE_CUSTOMERS')
  async list(@Query('search') search?: string) {
    const customers = await this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { orders: true, reservations: true },
        },
      },
    });

    return toPaginatedResponse(
      customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        notes: c.notes,
        totalOrders: c._count.orders,
        totalReservations: c._count.reservations,
        createdAt: c.createdAt,
      })),
      customers.length,
      1,
      customers.length,
    );
  }

  @Post()
  @RequirePermission('MANAGE_CUSTOMERS')
  async create(@Body() dto: CreateCustomerDto) {
    const customer = await this.prisma.customer.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        notes: dto.notes,
      },
    });
    return toResponse(customer);
  }

  @Get(':id')
  @RequirePermission('MANAGE_CUSTOMERS')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        orders: {
          where: { deletedAt: null, status: 'closed' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            createdAt: true,
            status: true,
            items: { select: { unitPriceWithTax: true, quantity: true } },
          },
        },
        reservations: {
          where: { deletedAt: null },
          orderBy: { dateTime: 'desc' },
          take: 10,
          include: { table: { select: { id: true, label: true } } },
        },
        loyaltyPoints: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, points: true, orderId: true, createdAt: true },
        },
      },
    });
    if (!customer) throw AppError.notFound('Customer', id);

    const loyaltyBalance = customer.loyaltyPoints.reduce(
      (acc, lp) => acc + lp.points,
      0,
    );

    return toResponse({ ...customer, loyaltyBalance });
  }

  @Patch(':id')
  @RequirePermission('MANAGE_CUSTOMERS')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Customer', id);
    if (existing.version !== dto.version)
      throw AppError.staleData('Customer', id);

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        version: { increment: 1 },
      },
    });
    return toResponse(updated);
  }

  @Delete(':id')
  @RequirePermission('MANAGE_CUSTOMERS')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Customer', id);

    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return toResponse({ deleted: true });
  }

  @Get(':id/loyalty')
  @RequirePermission('MANAGE_CUSTOMERS')
  async loyalty(@Param('id', ParseUUIDPipe) id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!customer) throw AppError.notFound('Customer', id);

    const points = await this.prisma.loyaltyPoints.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { id: true, createdAt: true } },
      },
    });

    const balance = points.reduce((acc, lp) => acc + lp.points, 0);

    return toResponse({
      customerId: id,
      customerName: customer.name,
      balance,
      history: points.map((lp) => ({
        id: lp.id,
        points: lp.points,
        orderId: lp.orderId,
        orderDate: lp.order.createdAt,
        createdAt: lp.createdAt,
      })),
    });
  }
}
