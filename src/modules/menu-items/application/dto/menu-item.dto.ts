import {
  IsString,
  IsNumberString,
  IsArray,
  IsUUID,
  IsOptional,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMenuItemDto {
  @ApiProperty({ example: 'Tacos de Pastor' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Tacos' })
  @IsString()
  category: string;

  @ApiProperty({
    example: '120.00',
    description: 'Precio final con IVA incluido',
  })
  @IsNumberString()
  salePriceWithTax: string;

  @ApiProperty({
    type: [String],
    description: 'IDs de estaciones que preparan este platillo',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  stationIds: string[];
}

export class UpdateMenuItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  salePriceWithTax?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsUUID('4', { each: true })
  stationIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiProperty()
  @IsNumber()
  version: number;
}
