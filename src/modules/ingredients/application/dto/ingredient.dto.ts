import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumberString, IsOptional, IsIn } from 'class-validator';

export class CreateIngredientDto {
  @ApiProperty({ example: 'Pollo entero' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'kg', description: 'Unit of measurement' })
  @IsString()
  unit: string;

  @ApiProperty({ example: '85.00', description: 'Cost per unit in MXN' })
  @IsNumberString()
  unitCost: string;

  @ApiProperty({ example: '10.000', description: 'Initial stock quantity' })
  @IsNumberString()
  stockQuantity: string;

  @ApiProperty({ example: '2.000', description: 'Minimum stock before alert' })
  @IsNumberString()
  minStock: string;
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

  @ApiPropertyOptional({ description: 'New cost per unit in MXN' })
  @IsOptional()
  @IsNumberString()
  unitCost?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  minStock?: string;

  @ApiProperty({ description: 'Current version for optimistic locking' })
  version: number;
}

export class AdjustInventoryDto {
  @ApiProperty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ enum: ['waste', 'adjustment'] })
  @IsIn(['waste', 'adjustment'])
  reason: 'waste' | 'adjustment';

  @ApiProperty({
    example: '-0.500',
    description: 'Negative = decrease stock, positive = increase',
  })
  @IsNumberString()
  quantityDelta: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
