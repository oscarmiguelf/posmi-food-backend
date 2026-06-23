import { Module } from '@nestjs/common';
import { CustomersController } from './infrastructure/http/customers.controller';

@Module({
  controllers: [CustomersController],
})
export class CustomersModule {}
