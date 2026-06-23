import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './infrastructure/http/purchase-orders.controller';

@Module({
  controllers: [PurchaseOrdersController],
})
export class PurchaseOrdersModule {}
