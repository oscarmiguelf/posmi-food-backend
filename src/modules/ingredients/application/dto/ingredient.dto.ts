import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';

export class CreateIngredientDto {
  @ApiProperty({ example: 'Pollo entero' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'kilogramo' })
  @IsString()
  unit: string;

  @ApiProperty({ example: 85.0 })
  @IsNumber()
  unitCost: number;

  @ApiProperty({ example: 10.0 })
  @IsNumber()
  stockQuantity: number;

  @ApiProperty({ example: 2.0 })
  @IsNumber()
  minStock: number;
}

export class UpdateIngredientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: 90.0 })
  @IsOptional()
  @IsNumber()
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minStock?: number;

  @ApiProperty()
  version: number;
}

export class AdjustInventoryDto {
  @ApiProperty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ enum: ['waste', 'adjustment'] })
  @IsIn(['waste', 'adjustment'])
  reason: 'waste' | 'adjustment';

  @ApiProperty({ example: -0.5 })
  @IsNumber()
  quantityDelta: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
