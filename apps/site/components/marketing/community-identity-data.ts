export type CommunityIdentityRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type CommunityIdentitySubtitle = 'communityOperations' | 'eventsAndMembership' | 'designCommunity' | 'studentNetwork' | 'communityCommunications';

export const COMMUNITY_IDENTITY_MEMBERS: ReadonlyArray<{
  id: string;
  name: string;
  role: CommunityIdentityRole;
  subtitle: CommunityIdentitySubtitle;
  avatarSeed: string;
}> = [
  { id: 'sample-owner', name: 'Sample Owner', role: 'OWNER', subtitle: 'communityOperations', avatarSeed: 'community-identity-sample-owner' },
  { id: 'daniel-okafor', name: 'Daniel Okafor', role: 'ADMIN', subtitle: 'eventsAndMembership', avatarSeed: 'community-identity-daniel-okafor' },
  { id: 'amour-m', name: 'Amour M', role: 'MEMBER', subtitle: 'designCommunity', avatarSeed: 'community-identity-amour-m' },
  { id: 'noah-kim', name: 'Noah Kim', role: 'MEMBER', subtitle: 'studentNetwork', avatarSeed: 'community-identity-noah-kim' },
  { id: 'amara-nsimba', name: 'Amara Nsimba', role: 'ADMIN', subtitle: 'communityCommunications', avatarSeed: 'community-identity-amara-nsimba' },
  { id: 'sara-ndinga', name: 'Sara Ndinga', role: 'MEMBER', subtitle: 'studentNetwork', avatarSeed: 'community-identity-sara-ndinga' },
];
