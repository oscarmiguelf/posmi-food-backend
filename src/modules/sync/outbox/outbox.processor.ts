import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const BATCH_SIZE = 50;
const INTERVAL_MS = 5_000;
const MAX_RETRIES = 5;

@Injectable()
export class OutboxProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly cloudUrl: string | undefined;
  private readonly syncMode: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.syncMode = config.get<string>('SYNC_MODE', 'local_hub');
    this.cloudUrl = config.get<string>('CLOUD_API_URL');
    this.start();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private start() {
    this.timer = setInterval(() => void this.flush(), INTERVAL_MS);
  }

  async flush(): Promise<void> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { processedAt: null, retryCount: { lt: MAX_RETRIES } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (!pending.length) return;

    for (const evt of pending) {
      try {
        await this.forward(
          evt.eventType,
          evt.payload as Record<string, unknown>,
          evt.idempotencyKey,
        );
        await this.prisma.outboxEvent.update({
          where: { id: evt.id },
          data: { processedAt: new Date() },
        });
      } catch (err) {
        this.logger.warn(
          `outbox fwd failed [${evt.eventType}] retry ${evt.retryCount + 1}: ${String(err)}`,
        );
        await this.prisma.outboxEvent.update({
          where: { id: evt.id },
          data: { retryCount: { increment: 1 }, failedAt: new Date() },
        });
      }
    }
  }

  private async forward(
    eventType: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<void> {
    if (!this.cloudUrl) {
      // No cloud configured — noop (used in cloud mode or dev)
      return;
    }
    const res = await fetch(`${this.cloudUrl}/api/v1/sync/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Outbox-Key': idempotencyKey,
        'X-Hub-Token': process.env.HUB_SECRET ?? '',
      },
      body: JSON.stringify({ eventType, payload, idempotencyKey }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      throw new Error(`cloud responded ${res.status}`);
    }
  }
}
