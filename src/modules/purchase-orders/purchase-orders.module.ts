import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './infrastructure/http/purchase-orders.controller';
import { ConfigAppModule } from '../config/config-app.module';

@Module({
  imports: [ConfigAppModule],
  controllers: [PurchaseOrdersController],
})
export class PurchaseOrdersModule {}
