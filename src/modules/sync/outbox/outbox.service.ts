import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a domain event to the outbox. Call inside the business transaction
   * to guarantee at-least-once delivery — if the tx rolls back, the event is
   * never written; if it commits, the processor will eventually forward it.
   */
  async publish(
    eventType: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    tx?: Tx,
  ): Promise<void> {
    const db = (tx as PrismaService | undefined) ?? this.prisma;
    await db.outboxEvent.create({
      data: {
        eventType,
        payload: payload as Prisma.InputJsonValue,
        idempotencyKey,
      },
    });
  }
}
