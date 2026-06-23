import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  IsDateString,
} from 'class-validator';

export class CreateReservationDto {
  @ApiProperty({ description: 'Customer UUID' })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({
    description: 'Table UUID (optional — can assign later)',
  })
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiProperty({
    example: '2026-07-01T19:30:00.000Z',
    description: 'ISO datetime for the reservation',
  })
  @IsDateString()
  dateTime: string;

  @ApiProperty({ example: 4, description: 'Number of guests' })
  @IsInt()
  @Min(1)
  partySize: number;

  @ApiPropertyOptional({ example: 'Celebración de cumpleaños, sin gluten' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateReservationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  partySize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Current version for optimistic locking' })
  version: number;
}
