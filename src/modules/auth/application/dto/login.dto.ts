import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@restaurante.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'supersecret123' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class TokensResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}
