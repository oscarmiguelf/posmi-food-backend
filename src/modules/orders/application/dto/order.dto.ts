import {
  IsUUID,
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

export class OrderItemInputDto {
  @ApiProperty()
  @IsUUID()
  menuItemId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderDto {
  @ApiProperty({ description: 'Idempotency key generado por el cliente' })
  @IsString()
  idempotencyKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];
}

export class AddOrderItemDto {
  @ApiProperty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['in_kitchen', 'ready', 'closed'] })
  @IsEnum(['in_kitchen', 'ready', 'closed'])
  status: Extract<OrderStatus, 'in_kitchen' | 'ready' | 'closed'>;

  @ApiProperty()
  @IsNumber()
  version: number;
}

export class CloseOrderDto {
  @ApiProperty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({
    type: [Object],
    description: 'Pagos parciales (monto + método)',
  })
  @IsArray()
  payments: { amount: string; paymentMethod: 'cash' | 'card' | 'transfer' }[];

  @ApiProperty()
  @IsNumber()
  version: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cashSessionId?: string;
}

export class ApplyDiscountDto {
  @ApiProperty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({
    enum: ['fixed', 'percentage', 'product', 'loyalty', 'coupon'],
  })
  @IsString()
  type: 'fixed' | 'percentage' | 'product' | 'loyalty' | 'coupon';

  @ApiProperty({ enum: ['order', 'line'] })
  @IsEnum(['order', 'line'])
  scope: 'order' | 'line';

  @ApiProperty({ example: '10.00' })
  @IsString()
  value: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderItemId?: string;
}
