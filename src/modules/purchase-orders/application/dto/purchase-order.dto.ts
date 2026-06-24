import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderItemDto {
  @ApiProperty({ description: 'Ingredient UUID' })
  @IsUUID()
  ingredientId: string;

  @ApiProperty({ example: 50.0 })
  @IsNumber()
  quantityOrdered: number;

  @ApiProperty({ example: 90.0 })
  @IsNumber()
  unitCost: number;
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

  @ApiProperty({ example: 48.5 })
  @IsNumber()
  quantityReceived: number;
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
