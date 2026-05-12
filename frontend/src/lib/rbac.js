export const ROLE_RANKS = {
  user: 0,
  admin: 1,
  super_admin: 2
};

export const SUPPORTED_ROLES = Object.keys(ROLE_RANKS);

export function normalizeRole(role) {
  return SUPPORTED_ROLES.includes(role) ? role : 'user';
}

export function isAdminOrHigher(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  return (ROLE_RANKS[normalizeRole(role)] ?? 0) >= ROLE_RANKS.admin;
}

export function isSuperAdmin(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  return normalizeRole(role) === 'super_admin';
}

export function isPrivilegedRole(role) {
  return isAdminOrHigher(role);
}

export function roleDisplayLabel(role) {
  return {
    user: 'USER',
    admin: 'ADMIN',
    super_admin: 'SUPER_ADMIN'
  }[normalizeRole(role)];
}

export function roleGovernanceLabel(role) {
  return {
    user: 'Operational Visibility',
    admin: 'Operational Governance',
    super_admin: 'Platform Governance'
  }[normalizeRole(role)];
}
