import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        // Each request gets a unique ID for log correlation
        genReqId: () => randomUUID(),
        // Structured fields required by section 4.5
        customProps: (req) => ({
          userId: (req as unknown as { user?: { sub: string } }).user?.sub,
          branchId: (req as unknown as { user?: { branchIds?: string[] } }).user
            ?.branchIds?.[0],
        }),
        // Human-readable in dev, pure JSON in production
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: { colorize: true, singleLine: true },
              }
            : undefined,
        // Skip health / config noise
        autoLogging: {
          ignore: (req) =>
            (req as unknown as { url: string }).url?.startsWith(
              '/api/v1/config',
            ) || (req as unknown as { url: string }).url?.startsWith('/health'),
        },
        level: process.env.LOG_LEVEL ?? 'info',
        serializers: {
          req: (req: { id: string; method: string; url: string }) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res: { statusCode: number }) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
  ],
  exports: [LoggerModule],
})
export class PinoLoggerModule {}
