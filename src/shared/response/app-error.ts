import { HttpException, HttpStatus } from '@nestjs/common';

export type AppErrorCode =
  | 'RESOURCE_NOT_FOUND'
  | 'DUPLICATE_ENTRY'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'CONFLICT_STALE_DATA'
  | 'INVENTORY_INSUFFICIENT_STOCK'
  | 'MODULE_NOT_ENABLED'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'IDEMPOTENCY_CONFLICT';

export class AppError extends HttpException {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    status: HttpStatus,
  ) {
    super({ code, message }, status);
  }

  static notFound(resource: string, id?: string): AppError {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
    return new AppError('RESOURCE_NOT_FOUND', msg, HttpStatus.NOT_FOUND);
  }

  static staleData(resource: string, id: string): AppError {
    return new AppError(
      'CONFLICT_STALE_DATA',
      `${resource} '${id}' was modified since last read — refresh and retry`,
      HttpStatus.CONFLICT,
    );
  }

  static duplicate(resource: string, field: string): AppError {
    return new AppError(
      'DUPLICATE_ENTRY',
      `${resource} with this ${field} already exists`,
      HttpStatus.CONFLICT,
    );
  }

  static insufficientPermissions(permission: string): AppError {
    return new AppError(
      'INSUFFICIENT_PERMISSIONS',
      `Required permission: ${permission}`,
      HttpStatus.FORBIDDEN,
    );
  }

  static insufficientStock(ingredientName: string): AppError {
    return new AppError(
      'INVENTORY_INSUFFICIENT_STOCK',
      `Insufficient stock for ingredient '${ingredientName}'`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  static moduleNotEnabled(moduleName: string): AppError {
    return new AppError(
      'MODULE_NOT_ENABLED',
      `Module '${moduleName}' is not enabled for this instance`,
      HttpStatus.FORBIDDEN,
    );
  }
}
