import { SetMetadata } from '@nestjs/common';
import type { OrgRole } from '@qpp/shared-types';

export const ROLES_KEY = 'required_roles';

export const RequireRole = (...roles: OrgRole[]) =>
  SetMetadata(ROLES_KEY, roles);
