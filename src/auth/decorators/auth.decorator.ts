import { applyDecorators, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { UserRoleGuard } from '../guards/user-roles.guard';
import { RolesProtected } from '../decorators/roles-protected.decorator';
import { UserRoles } from '../enum/user-roles.enum';

export const Auth = (
    ...roles: UserRoles[]
): ReturnType<typeof applyDecorators> => {
    return applyDecorators(
        RolesProtected(...roles),
        UseGuards(JwtAuthGuard, UserRoleGuard),
    );
};
