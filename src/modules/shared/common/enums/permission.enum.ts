/**
 * Fine-grained capabilities, checked by `@RequirePermission` + `PermissionGuard`.
 * Granted to roles via the ROLE_PERMISSIONS map. Placeholder set shipped with
 * the boilerplate — replace the members with your application's real
 * capabilities as the role set diverges beyond the admin/user split.
 */
export enum Permission {
  MANAGE_USERS = 'manage:users',
  MANAGE_CONTENT = 'manage:content',
  MANAGE_SETTINGS = 'manage:settings',
}
