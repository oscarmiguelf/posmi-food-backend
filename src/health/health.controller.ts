import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '1.0.0',
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      db: 'ok',
    };
  }
}
