import { type CommunityUserRole } from '@toolman/shared'

export function isCommunityModerator(role?: CommunityUserRole | null): boolean {
  return role === 'admin' || role === 'founder'
}

export function isCommunityFounder(role?: CommunityUserRole | null): boolean {
  return role === 'founder'
}

export function canDeleteCommunityComment(
  authorId: string,
  viewer?: { id: string; role?: CommunityUserRole | null } | null,
): boolean {
  if (!viewer) return false
  return viewer.id === authorId || isCommunityModerator(viewer.role)
}

export function canDeleteCommunityResource(
  ownerId: string,
  viewer?: { id: string; role?: CommunityUserRole | null } | null,
): boolean {
  if (!viewer) return false
  return viewer.id === ownerId || isCommunityModerator(viewer.role)
}
