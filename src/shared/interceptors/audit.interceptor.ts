import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const SKIP_PATHS = ['/auth/', '/config', '/sync/', '/health'];

interface AuthenticatedRequest extends Request {
  user?: CurrentUserPayload;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (
      !WRITE_METHODS.has(req.method) ||
      SKIP_PATHS.some((p) => req.url.includes(p)) ||
      !req.user
    ) {
      return next.handle();
    }

    const user = req.user;
    const { entityName, entityId } = extractEntity(req.url);
    const action = methodToAction(req.method);

    return next.handle().pipe(
      tap((responseData: unknown) => {
        // Fire-and-forget — audit log must not block the response
        void this.prisma.auditLog
          .create({
            data: {
              entityName,
              entityId: entityId ?? 'unknown',
              action,
              oldValue: Prisma.JsonNull,
              newValue:
                responseData &&
                typeof responseData === 'object' &&
                'data' in responseData
                  ? (responseData.data as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
              userId: user.sub,
              roleAtTime: user.roleId,
            },
          })
          .catch(() => {
            // Never let audit log failure bubble up
          });
      }),
    );
  }
}

function extractEntity(url: string): {
  entityName: string;
  entityId: string | null;
} {
  const segments = url.split('?')[0].split('/').filter(Boolean);
  const apiIdx = segments.indexOf('api');
  const relevant = apiIdx >= 0 ? segments.slice(apiIdx + 2) : segments;

  const entityName = relevant[0] ?? 'unknown';
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const entityId = relevant.find((s) => uuidRegex.test(s)) ?? null;

  return { entityName, entityId };
}

function methodToAction(method: string): string {
  switch (method) {
    case 'POST':
      return 'CREATE';
    case 'PATCH':
    case 'PUT':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return method;
  }
}
