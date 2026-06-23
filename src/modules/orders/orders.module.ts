import { Module } from '@nestjs/common';
import { OrdersController } from './infrastructure/http/orders.controller';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { CloseOrderUseCase } from './application/use-cases/close-order.use-case';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [OrdersController],
  providers: [CreateOrderUseCase, CloseOrderUseCase],
})
export class OrdersModule {}
