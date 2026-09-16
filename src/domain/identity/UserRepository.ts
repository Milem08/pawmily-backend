import { Role } from './Role';
import { User } from './User';

export interface CreateUserData {
  email: string;
  password: string;
  name: string;
  role: Role;
  phone?: string | null;
  clinic?: string | null;
  address?: string | null;
  license?: string | null;
  photo?: string | null;
}

export interface UpdateUserData {
  name?: string;
  phone?: string | null;
  clinic?: string | null;
  address?: string | null;
  license?: string | null;
  photo?: string | null;
  photoAssetId?: string | null;
  password?: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  update(id: string, data: UpdateUserData): Promise<User>;
}
