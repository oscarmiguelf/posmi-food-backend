import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const HEARTBEAT_MS = 60_000;

@Injectable()
export class HeartbeatService implements OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);
  private readonly cloudUrl: string | undefined;
  private readonly syncMode: string;
  private readonly hubSecret: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.syncMode = config.get<string>('SYNC_MODE', 'local_hub');
    this.cloudUrl = config.get<string>('CLOUD_API_URL');
    this.hubSecret = config.get<string>('HUB_SECRET', '');

    // Only the Local Hub sends heartbeats; the cloud instance receives them
    if (this.syncMode === 'local_hub' && this.cloudUrl) {
      this.start();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private start() {
    // Send immediately on boot, then on interval
    void this.send();
    this.timer = setInterval(() => void this.send(), HEARTBEAT_MS);
  }

  async send(): Promise<void> {
    if (!this.cloudUrl) return;

    try {
      const pending = await this.prisma.outboxEvent.count({
        where: { processedAt: null },
      });

      await fetch(`${this.cloudUrl}/api/v1/sync/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Token': this.hubSecret,
        },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          outboxPending: pending,
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      this.logger.warn(`heartbeat failed: ${String(err)}`);
    }
  }
}
