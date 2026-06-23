import { Module } from '@nestjs/common';
import { OrdersController } from './infrastructure/http/orders.controller';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { CloseOrderUseCase } from './application/use-cases/close-order.use-case';

@Module({
  controllers: [OrdersController],
  providers: [CreateOrderUseCase, CloseOrderUseCase],
})
export class OrdersModule {}
