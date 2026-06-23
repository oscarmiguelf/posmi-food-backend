import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsBoolean } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'María García' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: '+52 55 9876 5432' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'maria@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * LFPDPPP (section 3.10): the client must present a privacy notice before
   * creating a customer record. Pass true to confirm the customer acknowledged it.
   */
  @ApiPropertyOptional({
    description:
      'Set to true when customer has acknowledged the privacy notice (LFPDPPP)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  privacyConsent?: boolean;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Current version for optimistic locking' })
  version: number;
}
