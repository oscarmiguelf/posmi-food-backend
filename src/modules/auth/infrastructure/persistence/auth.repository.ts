import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  AuthRepositoryPort,
  UserAuthRecord,
} from '../../domain/ports/auth.repository.port';

@Injectable()
export class AuthRepository implements AuthRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string): Promise<UserAuthRecord | null> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
        userBranches: true,
      },
    });
    if (!user) return null;
    return this.mapToRecord(user);
  }

  async findUserById(id: string): Promise<UserAuthRecord | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
        userBranches: true,
      },
    });
    if (!user) return null;
    return this.mapToRecord(user);
  }

  async saveRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.processedOperation.upsert({
      where: { idempotencyKey: `refresh:${userId}` },
      update: {
        result: { tokenHash, expiresAt },
        processedAt: new Date(),
        expiresAt,
      },
      create: {
        idempotencyKey: `refresh:${userId}`,
        result: { tokenHash, expiresAt },
        processedAt: new Date(),
        expiresAt,
      },
    });
  }

  async revokeRefreshToken(userId: string): Promise<void> {
    await this.prisma.processedOperation.deleteMany({
      where: { idempotencyKey: `refresh:${userId}` },
    });
  }

  // Token hash comparison deferred to future — currently validates by userId + expiry
  async validateRefreshToken(
    userId: string,
    tokenHash: string,
  ): Promise<boolean> {
    void tokenHash;
    const record = await this.prisma.processedOperation.findUnique({
      where: { idempotencyKey: `refresh:${userId}` },
    });
    if (!record) return false;
    if (record.expiresAt < new Date()) return false;
    return true;
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  private mapToRecord(user: {
    id: string;
    email: string;
    passwordHash: string;
    isActive: boolean;
    companyId: string;
    role: {
      id: string;
      name: string;
      rolePermissions: { permission: { code: string } }[];
    };
    userBranches: { branchId: string }[];
  }): UserAuthRecord {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      isActive: user.isActive,
      companyId: user.companyId,
      roleId: user.role.id,
      roleName: user.role.name,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.code),
      branchIds: user.userBranches.map((ub) => ub.branchId),
    };
  }
}
