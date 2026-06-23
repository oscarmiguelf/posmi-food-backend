import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PERMISSIONS, ROLE_PERMISSIONS } from './seeds/permissions.seed';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding permissions and roles...');

  // Upsert all permissions
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description },
      create: { code: perm.code, description: perm.description },
    });
  }

  // Upsert roles with their permissions
  for (const [roleName, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

    // Clear and recreate role permissions (idempotent)
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    const permissions = await prisma.permission.findMany({
      where: { code: { in: permCodes }, deletedAt: null },
    });

    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });

    console.log(`  Role "${roleName}" — ${permissions.length} permissions`);
  }

  // Seed a demo Company + Branch + Admin user (only if none exists)
  let company = await prisma.company.findFirst({
    where: { name: 'Demo Restaurant' },
  });
  if (!company) {
    company = await prisma.company.create({
      data: { name: 'Demo Restaurant' },
    });
  }

  let branch = await prisma.branch.findFirst({
    where: { companyId: company.id, name: 'Sucursal Principal' },
  });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Sucursal Principal',
        timezone: 'America/Mexico_City',
      },
    });
  }

  const adminRole = await prisma.role.findFirstOrThrow({
    where: { name: 'Admin' },
  });
  const existingAdmin = await prisma.user.findFirst({
    where: { email: 'admin@demo.com', companyId: company.id },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('Admin1234!', 12);
    const admin = await prisma.user.create({
      data: {
        name: 'Admin Demo',
        email: 'admin@demo.com',
        passwordHash,
        companyId: company.id,
        roleId: adminRole.id,
      },
    });

    await prisma.userBranch.create({
      data: { userId: admin.id, branchId: branch.id },
    });
    console.log('  Admin user created: admin@demo.com / Admin1234!');
  } else {
    console.log('  Admin user already exists');
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
