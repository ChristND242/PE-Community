type UserRoleTranslations = {
  status: {
    owner: string;
    admin: string;
    member: string;
  };
};

export function userRoleLabel(t: UserRoleTranslations, role?: string | null) {
  if (!role) return '';

  switch (role.trim().toUpperCase()) {
    case 'OWNER':
      return t.status.owner;
    case 'ADMIN':
      return t.status.admin;
    case 'MEMBER':
      return t.status.member;
    default:
      return role;
  }
}
