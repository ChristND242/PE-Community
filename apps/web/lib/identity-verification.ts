export type IdentityVerificationKind = 'administrator' | 'owner' | 'official-community';

export function identityVerificationForRole(role?: string | null): IdentityVerificationKind | null {
  switch (role?.trim().toLowerCase()) {
    case 'owner':
      return 'owner';
    case 'admin':
    case 'administrator':
      return 'administrator';
    default:
      return null;
  }
}

export function identityVerificationForPublisher(verification?: string | null): IdentityVerificationKind | null {
  switch (verification) {
    case 'OWNER':
      return 'owner';
    case 'ADMINISTRATOR':
      return 'administrator';
    case 'OFFICIAL_COMMUNITY':
      return 'official-community';
    default:
      return null;
  }
}
