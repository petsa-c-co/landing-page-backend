import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { UserRoles } from '@/auth/enum/user-roles.enum';

export const META_ROLES = 'roles';

export const RolesProtected = (...args: UserRoles[]): CustomDecorator<string> =>
    SetMetadata(META_ROLES, args);
