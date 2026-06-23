export interface UserAuthRecord {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  companyId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  branchIds: string[];
}

export abstract class AuthRepositoryPort {
  abstract findUserByEmail(email: string): Promise<UserAuthRecord | null>;
  abstract findUserById(id: string): Promise<UserAuthRecord | null>;
  abstract saveRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  abstract revokeRefreshToken(userId: string): Promise<void>;
  abstract validateRefreshToken(
    userId: string,
    tokenHash: string,
  ): Promise<boolean>;
  abstract updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void>;
}
