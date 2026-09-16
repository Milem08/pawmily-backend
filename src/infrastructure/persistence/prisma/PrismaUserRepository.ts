import { User } from '../../../domain/identity/User';
import { Role, assertRole } from '../../../domain/identity/Role';
import {
  CreateUserData,
  UpdateUserData,
  UserRepository,
} from '../../../domain/identity/UserRepository';
import { prisma } from './prismaClient';

function mapUser(row: {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  phone: string | null;
  clinic: string | null;
  address: string | null;
  license: string | null;
  photo: string | null;
  emailVerifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return new User({
    ...row,
    emailVerifiedAt: row.emailVerifiedAt ?? null,
    role: assertRole(row.role),
  });
}

export class PrismaUserRepository implements UserRepository {
  async findById(id: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { id } });
    return row ? mapUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { email } });
    return row ? mapUser(row) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const row = await prisma.user.findFirst({ where: { phone } });
    return row ? mapUser(row) : null;
  }

  async create(data: CreateUserData): Promise<User> {
    const row = await prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        name: data.name,
        role: data.role,
        phone: data.phone ?? null,
        clinic: data.clinic ?? null,
        address: data.address ?? null,
        license: data.license ?? null,
        photo: data.photo ?? null,
      },
    });
    return mapUser(row);
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
    const row = await prisma.user.update({
      where: { id },
      data,
    });
    return mapUser(row);
  }
}
