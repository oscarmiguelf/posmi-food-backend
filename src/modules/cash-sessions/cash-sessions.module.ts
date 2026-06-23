import { Module } from '@nestjs/common';
import { CashSessionsController } from './infrastructure/http/cash-sessions.controller';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [CashSessionsController],
})
export class CashSessionsModule {}
