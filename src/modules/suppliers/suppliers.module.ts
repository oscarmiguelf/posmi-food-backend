import { Module } from '@nestjs/common';
import { SuppliersController } from './infrastructure/http/suppliers.controller';

@Module({
  controllers: [SuppliersController],
})
export class SuppliersModule {}
