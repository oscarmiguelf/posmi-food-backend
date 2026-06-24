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

export class ItemModifierDto {
  @ApiProperty()
  @IsString()
  ingredientName: string;

  @ApiProperty({ enum: ['remove', 'add'] })
  @IsEnum(['remove', 'add'])
  action: 'remove' | 'add';

  @ApiPropertyOptional({ example: '15.00' })
  @IsOptional()
  @IsString()
  extraPrice?: string;
}

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

  @ApiPropertyOptional({ type: [ItemModifierDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemModifierDto)
  modifiers?: ItemModifierDto[];
}

export class CreateOrderDto {
  @ApiProperty({ description: 'Idempotency key generado por el cliente' })
  @IsString()
  idempotencyKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'IDs de mesas adicionales (para juntar mesas)',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  extraTableIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Nombre genérico si no hay cliente registrado',
  })
  @IsOptional()
  @IsString()
  customerName?: string;

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

export class UpdateItemStatusDto {
  @ApiProperty({ enum: ['pending', 'in_kitchen', 'ready', 'delivered'] })
  @IsString()
  itemStatus: string;
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
  payments: { amount: number; paymentMethod: 'cash' | 'card' | 'transfer' }[];

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
