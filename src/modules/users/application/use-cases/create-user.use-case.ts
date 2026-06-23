import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { CreateUserDto } from '../dto/user.dto';
import { AppError } from '../../../../shared/response/app-error';
import { CurrentUserPayload } from '../../../../shared/decorators/current-user.decorator';

@Injectable()
export class CreateUserUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: CreateUserDto, caller: CurrentUserPayload) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, companyId: caller.companyId, deletedAt: null },
    });
    if (existing) throw AppError.duplicate('User', 'email');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          roleId: dto.roleId,
          companyId: caller.companyId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          roleId: true,
          createdAt: true,
        },
      });

      if (dto.branchIds.length > 0) {
        await tx.userBranch.createMany({
          data: dto.branchIds.map((branchId) => ({
            userId: user.id,
            branchId,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          entityName: 'User',
          entityId: user.id,
          action: 'CREATE',
          newValue: { email: dto.email, roleId: dto.roleId },
          userId: caller.sub,
          roleAtTime: caller.roleName,
        },
      });

      return user;
    });
  }
}
