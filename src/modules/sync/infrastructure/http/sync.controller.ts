import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { EventsGateway } from '../../../../shared/websocket/events.gateway';
import { toResponse } from '../../../../shared/response/api-response';
import { OutboxProcessor } from '../../outbox/outbox.processor';

interface IngestDto {
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

interface HeartbeatDto {
  timestamp: string;
  outboxPending: number;
}

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  private readonly hubSecret: string;
  private readonly syncMode: string;
  private lastHeartbeat: { at: string; outboxPending: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly processor: OutboxProcessor,
    config: ConfigService,
  ) {
    this.hubSecret = config.get<string>('HUB_SECRET', '');
    this.syncMode = config.get<string>('SYNC_MODE', 'local_hub');
  }

  /**
   * GET /sync/status — public health check (no auth required)
   * Returns current sync mode, outbox backlog, and last heartbeat received.
   */
  @Get('status')
  async status() {
    const outboxPending = await this.prisma.outboxEvent.count({
      where: { processedAt: null },
    });
    const outboxFailed = await this.prisma.outboxEvent.count({
      where: { processedAt: null, retryCount: { gte: 5 } },
    });

    return toResponse({
      syncMode: this.syncMode,
      outboxPending,
      outboxFailed,
      lastHeartbeat: this.lastHeartbeat,
    });
  }

  /**
   * POST /sync/heartbeat — received by the Cloud from the Local Hub.
   * Updates in-memory last-seen state and can trigger alerts if missing.
   */
  @Post('heartbeat')
  heartbeat(@Headers('x-hub-token') token: string, @Body() dto: HeartbeatDto) {
    this.guardHubToken(token);
    this.lastHeartbeat = {
      at: dto.timestamp,
      outboxPending: dto.outboxPending,
    };
    return toResponse({ received: true });
  }

  /**
   * POST /sync/ingest — Cloud endpoint that receives outbox events from the
   * Local Hub and re-emits them on the Cloud WebSocket gateway so remote
   * clients (owner's phone/browser) see live updates.
   */
  @Post('ingest')
  ingest(@Headers('x-hub-token') token: string, @Body() dto: IngestDto) {
    this.guardHubToken(token);

    const branchId = (dto.payload as { branchId?: string }).branchId;
    if (branchId) {
      this.events.emitToBranch(branchId, dto.eventType, dto.payload);
    }

    return toResponse({ accepted: true });
  }

  /**
   * POST /sync/flush — manually trigger the outbox processor (dev/ops use).
   */
  @Post('flush')
  async flush(@Headers('x-hub-token') token: string) {
    this.guardHubToken(token);
    await this.processor.flush();
    return toResponse({ flushed: true });
  }

  private guardHubToken(token: string) {
    // If no secret is configured (dev/local), allow all requests
    if (!this.hubSecret) return;
    if (token !== this.hubSecret) {
      throw new UnauthorizedException('Invalid hub token');
    }
  }
}
