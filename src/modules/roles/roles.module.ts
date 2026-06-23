import { Module } from '@nestjs/common';
import { RolesController } from './infrastructure/http/roles.controller';

@Module({
  controllers: [RolesController],
})
export class RolesModule {}
