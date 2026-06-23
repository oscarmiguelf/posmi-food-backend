import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiQuery, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import Decimal from 'decimal.js';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../../shared/guards/permission.guard';
import { RequirePermission } from '../../../../shared/decorators/require-permission.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../../shared/decorators/current-user.decorator';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { calculateTaxBreakdown } from '../../../menu-items/domain/entities/tax.calculator';
import { toResponse } from '../../../../shared/response/api-response';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('profitability')
  @RequirePermission('VIEW_PROFITABILITY_REPORTS')
  async profitability() {
    const menuItems = await this.prisma.menuItem.findMany({
      where: { deletedAt: null },
      include: {
        recipe: {
          include: {
            recipeItems: {
              where: { deletedAt: null },
              include: {
                ingredient: { select: { unitCost: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const rows = menuItems.map((item) => {
      const breakdown = calculateTaxBreakdown(
        new Decimal(item.salePriceWithTax.toString()),
      );
      const priceWithoutTax = breakdown.priceWithoutTax;

      if (!item.recipe || item.recipe.recipeItems.length === 0) {
        return {
          id: item.id,
          name: item.name,
          category: item.category,
          salePriceWithTax: item.salePriceWithTax.toString(),
          priceWithoutTax: priceWithoutTax.toFixed(2),
          recipeCost: null,
          margin: null,
          foodCostPercent: null,
          hasRecipe: false,
        };
      }

      const recipeCost = item.recipe.recipeItems.reduce((acc, ri) => {
        return acc.plus(
          new Decimal(ri.ingredient.unitCost.toString()).times(
            ri.quantity.toString(),
          ),
        );
      }, new Decimal(0));

      const margin = priceWithoutTax.minus(recipeCost);
      const foodCostPercent = priceWithoutTax.isZero()
        ? new Decimal(0)
        : recipeCost.div(priceWithoutTax).times(100).toDecimalPlaces(2);

      return {
        id: item.id,
        name: item.name,
        category: item.category,
        salePriceWithTax: item.salePriceWithTax.toString(),
        priceWithoutTax: priceWithoutTax.toFixed(2),
        recipeCost: recipeCost.toFixed(2),
        margin: margin.toFixed(2),
        foodCostPercent: foodCostPercent.toFixed(2),
        hasRecipe: true,
      };
    });

    // Sort by food cost % descending (most expensive items first for attention)
    const sorted = [...rows].sort((a, b) => {
      if (a.foodCostPercent === null) return 1;
      if (b.foodCostPercent === null) return -1;
      return parseFloat(b.foodCostPercent) - parseFloat(a.foodCostPercent);
    });

    return toResponse({ items: sorted });
  }

  @Get('sales')
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'ISO date e.g. 2024-01-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'ISO date e.g. 2024-01-31',
  })
  @RequirePermission('VIEW_FINANCIAL_REPORTS')
  async sales(
    @CurrentUser() user: CurrentUserPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const orders = await this.prisma.order.findMany({
      where: {
        branchId: { in: user.branchIds },
        status: 'closed',
        deletedAt: null,
        ...(from || to ? { createdAt: dateFilter } : {}),
      },
      include: {
        items: {
          include: {
            menuItem: { select: { category: true, name: true } },
          },
        },
        discounts: true,
      },
    });

    const byCategory = new Map<string, Decimal>();
    let totalSales = new Decimal(0);
    let totalOrders = 0;

    for (const order of orders) {
      totalOrders++;
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
      const orderTotal = Decimal.max(
        subtotal.minus(discountTotal),
        new Decimal(0),
      );
      totalSales = totalSales.plus(orderTotal);

      for (const item of order.items) {
        const cat = item.menuItem.category;
        const itemRevenue = new Decimal(item.unitPriceWithTax.toString()).times(
          item.quantity,
        );
        byCategory.set(
          cat,
          (byCategory.get(cat) ?? new Decimal(0)).plus(itemRevenue),
        );
      }
    }

    const salesByCategory = Array.from(byCategory.entries())
      .map(([category, total]) => ({
        category,
        total: total.toFixed(2),
      }))
      .sort((a, b) => parseFloat(b.total) - parseFloat(a.total));

    return toResponse({
      from: from ?? null,
      to: to ?? null,
      totalOrders,
      totalSales: totalSales.toFixed(2),
      averageTicket:
        totalOrders > 0
          ? totalSales.div(totalOrders).toDecimalPlaces(2).toFixed(2)
          : '0.00',
      salesByCategory,
    });
  }

  @Get('inventory-variance')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @RequirePermission('VIEW_PROFITABILITY_REPORTS')
  async inventoryVariance(
    @CurrentUser() user: CurrentUserPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        branchId: { in: user.branchIds },
        reason: 'sale',
        ...(from || to ? { createdAt: dateFilter } : {}),
      },
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            unit: true,
            unitCost: true,
            stockQuantity: true,
            minStock: true,
          },
        },
      },
    });

    const byIngredient = new Map<
      string,
      {
        ingredient: (typeof movements)[0]['ingredient'];
        totalConsumed: Decimal;
      }
    >();

    for (const m of movements) {
      // quantityDelta is negative for sales (deducted from stock)
      const consumed = new Decimal(m.quantityDelta.toString()).abs();
      const entry = byIngredient.get(m.ingredientId);
      if (entry) {
        entry.totalConsumed = entry.totalConsumed.plus(consumed);
      } else {
        byIngredient.set(m.ingredientId, {
          ingredient: m.ingredient,
          totalConsumed: consumed,
        });
      }
    }

    const rows = Array.from(byIngredient.values()).map(
      ({ ingredient, totalConsumed }) => ({
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        currentStock: ingredient.stockQuantity.toString(),
        minStock: ingredient.minStock.toString(),
        isLow: new Decimal(
          ingredient.stockQuantity.toString(),
        ).lessThanOrEqualTo(new Decimal(ingredient.minStock.toString())),
        theoreticalConsumed: totalConsumed.toFixed(3),
        estimatedCost: new Decimal(ingredient.unitCost.toString())
          .times(totalConsumed)
          .toFixed(2),
      }),
    );

    // Sort by estimated cost descending
    rows.sort(
      (a, b) => parseFloat(b.estimatedCost) - parseFloat(a.estimatedCost),
    );

    return toResponse({
      from: from ?? null,
      to: to ?? null,
      ingredients: rows,
    });
  }
}
