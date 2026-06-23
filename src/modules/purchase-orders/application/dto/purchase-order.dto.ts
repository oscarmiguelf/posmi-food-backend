import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumberString,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderItemDto {
  @ApiProperty({ description: 'Ingredient UUID' })
  @IsUUID()
  ingredientId: string;

  @ApiProperty({ example: '50.000', description: 'Units to order' })
  @IsNumberString()
  quantityOrdered: string;

  @ApiProperty({ example: '90.00', description: 'Agreed unit cost in MXN' })
  @IsNumberString()
  unitCost: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ description: 'Supplier UUID' })
  @IsUUID()
  supplierId: string;

  @ApiProperty({ type: [PurchaseOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}

export class ReceiveItemDto {
  @ApiProperty({ description: 'Ingredient UUID' })
  @IsUUID()
  ingredientId: string;

  @ApiProperty({ example: '48.500', description: 'Actual quantity received' })
  @IsNumberString()
  quantityReceived: string;
}

export class ReceivePurchaseOrderDto {
  @ApiProperty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ type: [ReceiveItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];

  @ApiPropertyOptional({ description: 'Receiving notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
