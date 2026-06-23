import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthRepositoryPort } from '../../domain/ports/auth.repository.port';
import {
  LoginDto,
  ChangePasswordDto,
  TokensResponseDto,
} from '../dto/login.dto';
import { CurrentUserPayload } from '../../../../shared/decorators/current-user.decorator';

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly authRepo: AuthRepositoryPort,
    private readonly jwt: JwtService,
  ) {}

  async execute(dto: LoginDto): Promise<TokensResponseDto> {
    const user = await this.authRepo.findUserByEmail(dto.email);
    if (!user || !user.isActive)
      throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    return this.generateTokens(user.id, {
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.roleName,
      companyId: user.companyId,
      branchIds: user.branchIds,
    });
  }

  async refresh(
    userId: string,
    oldRefreshToken: string,
  ): Promise<TokensResponseDto> {
    const tokenHash = await bcrypt.hash(oldRefreshToken, 1);
    const valid = await this.authRepo.validateRefreshToken(userId, tokenHash);
    if (!valid) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.authRepo.findUserById(userId);
    if (!user || !user.isActive)
      throw new UnauthorizedException('User not found or inactive');

    return this.generateTokens(userId, {
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.roleName,
      companyId: user.companyId,
      branchIds: user.branchIds,
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.authRepo.findUserById(userId);
    if (!user || !user.isActive)
      throw new UnauthorizedException('User not found or inactive');

    const match = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!match)
      throw new UnauthorizedException('Current password is incorrect');

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.authRepo.updatePasswordHash(userId, newHash);
  }

  private async generateTokens(
    userId: string,
    payload: CurrentUserPayload,
  ): Promise<TokensResponseDto> {
    const accessToken = this.jwt.sign(payload, { expiresIn: '8h' });
    const refreshToken = this.jwt.sign({ sub: userId }, { expiresIn: '30d' });

    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.authRepo.saveRefreshToken(userId, tokenHash, expiresAt);

    return { accessToken, refreshToken };
  }
}
