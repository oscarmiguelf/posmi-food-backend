import { Module } from '@nestjs/common';
import { ReservationsController } from './infrastructure/http/reservations.controller';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [ReservationsController],
})
export class ReservationsModule {}
