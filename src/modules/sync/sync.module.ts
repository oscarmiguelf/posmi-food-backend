import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { EventsModule } from '../../shared/websocket/events.module';
import { OutboxService } from './outbox/outbox.service';
import { OutboxProcessor } from './outbox/outbox.processor';
import { HeartbeatService } from './heartbeat/heartbeat.service';
import { SyncController } from './infrastructure/http/sync.controller';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [SyncController],
  providers: [OutboxService, OutboxProcessor, HeartbeatService],
  exports: [OutboxService],
})
export class SyncModule {}
