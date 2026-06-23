import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import {
  LoginDto,
  RefreshTokenDto,
  ChangePasswordDto,
} from '../../application/dto/login.dto';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../../shared/decorators/current-user.decorator';
import { toResponse } from '../../../../shared/response/api-response';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return toResponse(await this.loginUseCase.execute(dto));
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return toResponse(
      await this.loginUseCase.refresh(dto.refreshToken, dto.refreshToken),
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  async changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.loginUseCase.changePassword(user.sub, dto);
    return toResponse({ message: 'Password changed successfully' });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: CurrentUserPayload) {
    return toResponse({ message: `User ${user.sub} logged out` });
  }
}
