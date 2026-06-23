import { Module } from '@nestjs/common';
import { CustomersController } from './infrastructure/http/customers.controller';
import { ConfigAppModule } from '../config/config-app.module';

@Module({
  imports: [ConfigAppModule],
  controllers: [CustomersController],
})
export class CustomersModule {}
