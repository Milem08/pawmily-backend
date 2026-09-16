import { Role } from './Role';

export interface UserProps {
  id: string;
  email: string;
  password: string;
  name: string;
  role: Role;
  phone?: string | null;
  clinic?: string | null;
  address?: string | null;
  license?: string | null;
  photo?: string | null;
  photoAssetId?: string | null;
  emailVerifiedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class User {
  constructor(public readonly props: UserProps) {}

  get id() {
    return this.props.id;
  }

  get email() {
    return this.props.email;
  }

  get role() {
    return this.props.role;
  }

  toPublic() {
    const { password: _password, ...rest } = this.props;
    return rest;
  }
}
