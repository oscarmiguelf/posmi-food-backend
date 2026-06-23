import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './infrastructure/http/auth.controller';
import { AuthRepository } from './infrastructure/persistence/auth.repository';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { AuthRepositoryPort } from './domain/ports/auth.repository.port';
import { JwtStrategy } from '../../shared/guards/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    JwtStrategy,
    { provide: AuthRepositoryPort, useClass: AuthRepository },
  ],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
