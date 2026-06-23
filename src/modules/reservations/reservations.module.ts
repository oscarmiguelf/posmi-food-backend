import { Module } from '@nestjs/common';
import { ReservationsController } from './infrastructure/http/reservations.controller';
import { SyncModule } from '../sync/sync.module';
import { ConfigAppModule } from '../config/config-app.module';

@Module({
  imports: [SyncModule, ConfigAppModule],
  controllers: [ReservationsController],
})
export class ReservationsModule {}
