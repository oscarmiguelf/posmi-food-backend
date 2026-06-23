import { Module } from '@nestjs/common';
import { ReservationsController } from './infrastructure/http/reservations.controller';

@Module({
  controllers: [ReservationsController],
})
export class ReservationsModule {}
