import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../../shared/guards/permission.guard';
import { RequirePermission } from '../../../../shared/decorators/require-permission.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../../shared/decorators/current-user.decorator';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { toResponse } from '../../../../shared/response/api-response';
import { AppError } from '../../../../shared/response/app-error';

class UpdateCompanyDto {
  @ApiProperty({ example: 'Tacos El Güero', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ example: 'XAXX010101000', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(13)
  taxId?: string;
}

class UpdateBranchDto {
  @ApiProperty({ example: 'Sucursal Centro', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ example: 'Av. Juárez 123, Col. Centro', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiProperty({ example: 'America/Mexico_City', required: false })
  @IsOptional()
  @IsString()
  timezone?: string;
}

@ApiTags('business')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('business')
export class BusinessController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('MANAGE_USERS')
  async get(@CurrentUser() user: CurrentUserPayload) {
    const company = await this.prisma.company.findFirst({
      where: { id: user.companyId, deletedAt: null },
    });
    if (!company) throw AppError.notFound('Company', user.companyId);

    const branchId = user.branchIds[0];
    const branch = branchId
      ? await this.prisma.branch.findFirst({
          where: { id: branchId, deletedAt: null },
        })
      : null;

    return toResponse({ company, branch });
  }

  @Patch('company')
  @RequirePermission('MANAGE_USERS')
  async updateCompany(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateCompanyDto,
  ) {
    const company = await this.prisma.company.findFirst({
      where: { id: user.companyId, deletedAt: null },
    });
    if (!company) throw AppError.notFound('Company', user.companyId);

    if (dto.name && dto.name !== company.name) {
      const conflict = await this.prisma.company.findFirst({
        where: { name: dto.name, deletedAt: null },
      });
      if (conflict) throw AppError.duplicate('Company', 'name');
    }

    const updated = await this.prisma.company.update({
      where: { id: company.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId }),
        version: { increment: 1 },
      },
    });

    return toResponse(updated);
  }

  @Patch('branch')
  @RequirePermission('MANAGE_USERS')
  async updateBranch(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateBranchDto,
  ) {
    const branchId = user.branchIds[0];
    if (!branchId) throw AppError.notFound('Branch', 'current user');

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) throw AppError.notFound('Branch', branchId);

    const updated = await this.prisma.branch.update({
      where: { id: branch.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        version: { increment: 1 },
      },
    });

    return toResponse(updated);
  }
}
