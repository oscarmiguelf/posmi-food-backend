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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
  CreateSupplierDto,
  UpdateSupplierDto,
} from '../../application/dto/supplier.dto';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('MANAGE_SUPPLIERS')
  async list() {
    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return toPaginatedResponse(
      suppliers,
      suppliers.length,
      1,
      suppliers.length,
    );
  }

  @Post()
  @RequirePermission('MANAGE_SUPPLIERS')
  async create(@Body() dto: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findFirst({
      where: { name: dto.name, deletedAt: null },
    });
    if (existing) throw AppError.duplicate('Supplier', dto.name);

    const supplier = await this.prisma.supplier.create({
      data: {
        name: dto.name,
        contact: dto.contact,
        phone: dto.phone,
        email: dto.email,
      },
    });
    return toResponse(supplier);
  }

  @Get(':id')
  @RequirePermission('MANAGE_SUPPLIERS')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        purchaseOrders: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            items: {
              include: { ingredient: { select: { name: true, unit: true } } },
            },
          },
        },
      },
    });
    if (!supplier) throw AppError.notFound('Supplier', id);
    return toResponse(supplier);
  }

  @Patch(':id')
  @RequirePermission('MANAGE_SUPPLIERS')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Supplier', id);
    if (existing.version !== dto.version)
      throw AppError.staleData('Supplier', id);

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.contact !== undefined && { contact: dto.contact }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        version: { increment: 1 },
      },
    });
    return toResponse(updated);
  }

  @Delete(':id')
  @RequirePermission('MANAGE_SUPPLIERS')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Supplier', id);

    await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return toResponse({ deleted: true });
  }
}
