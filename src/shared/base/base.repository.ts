import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AppError } from '../response/app-error';

export interface SoftDeletable {
  id: string;
  deletedAt: Date | null;
  version: number;
}

// Prisma model delegates are not statically typed at BaseRepository level —
// each subclass knows its concrete model via modelName.

type PrismaModel = Record<string, (...args: any[]) => Promise<any>>;

export abstract class BaseRepository<T extends SoftDeletable> {
  protected abstract readonly modelName: string;

  constructor(protected readonly prisma: PrismaService) {}

  protected get model(): PrismaModel {
    return (this.prisma as unknown as Record<string, PrismaModel>)[
      this.modelName
    ];
  }

  async findById(id: string): Promise<T | null> {
    return (await this.model['findFirst']({
      where: { id, deletedAt: null },
    })) as T | null;
  }

  async findByIdOrFail(id: string): Promise<T> {
    const entity = await this.findById(id);
    if (!entity)
      throw new NotFoundException(AppError.notFound(this.modelName, id));
    return entity;
  }

  async softDelete(id: string, expectedVersion: number): Promise<T> {
    const entity = await this.findByIdOrFail(id);
    this.assertVersion(entity, expectedVersion);

    return (await this.model['update']({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    })) as T;
  }

  protected assertVersion(
    entity: SoftDeletable,
    expectedVersion: number,
  ): void {
    if (entity.version !== expectedVersion) {
      throw AppError.staleData(this.modelName, entity.id);
    }
  }
}
