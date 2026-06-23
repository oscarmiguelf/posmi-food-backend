import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { toResponse } from '../../../../shared/response/api-response';
import { AppError } from '../../../../shared/response/app-error';

@ApiTags('digital-menu')
@Controller('digital-menu')
export class DigitalMenuController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':branchId')
  async getMenu(@Param('branchId', ParseUUIDPipe) branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      include: {
        company: { select: { name: true } },
      },
    });
    if (!branch) throw AppError.notFound('Branch', branchId);

    const categories = await this.prisma.menuCategory.findMany({
      where: { branchId, deletedAt: null, isVisible: true },
      orderBy: { displayOrder: 'asc' },
      include: {
        menuItems: {
          where: { deletedAt: null, isAvailable: true },
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            salePriceWithTax: true,
            type: { select: { name: true } },
            extras: {
              where: { deletedAt: null },
              select: {
                id: true,
                ingredientName: true,
                priceWithTax: true,
              },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    // Also include items without a category
    const uncategorized = await this.prisma.menuItem.findMany({
      where: {
        deletedAt: null,
        isAvailable: true,
        menuCategoryId: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        salePriceWithTax: true,
        category: true,
        type: { select: { name: true } },
        extras: {
          where: { deletedAt: null },
          select: {
            id: true,
            ingredientName: true,
            priceWithTax: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return toResponse({
      branch: {
        id: branch.id,
        name: branch.name,
        companyName: branch.company.name,
        address: branch.address,
      },
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        imageUrl: c.imageUrl,
        items: c.menuItems.map((item) => ({
          ...item,
          salePriceWithTax: item.salePriceWithTax.toString(),
          extras: item.extras.map((e) => ({
            ...e,
            priceWithTax: e.priceWithTax.toString(),
          })),
        })),
      })),
      uncategorized: uncategorized.map((item) => ({
        ...item,
        salePriceWithTax: item.salePriceWithTax.toString(),
        extras: item.extras.map((e) => ({
          ...e,
          priceWithTax: e.priceWithTax.toString(),
        })),
      })),
    });
  }
}
