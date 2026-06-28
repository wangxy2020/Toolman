import type { P2pMember, P2pSharedResource } from '@toolman/shared'

export interface GroupMemberResourceSection {
  memberId: string
  displayName: string
  isSelf: boolean
  resources: P2pSharedResource[]
}

export function resolveMemberDisplayName(
  memberId: string,
  members: P2pMember[],
  unknownMemberLabel: string,
): string {
  const member = members.find((item) => item.id === memberId)
  return member?.displayName?.trim() || unknownMemberLabel
}

export function groupResourcesByMember(
  resources: P2pSharedResource[],
  members: P2pMember[],
  selfMemberId: string | null,
  unknownMemberLabel: string,
): GroupMemberResourceSection[] {
  const byMember = new Map<string, P2pSharedResource[]>()

  for (const resource of resources) {
    const memberKey = resource.sharedBy
    const bucket = byMember.get(memberKey) ?? []
    bucket.push(resource)
    byMember.set(memberKey, bucket)
  }

  return [...byMember.entries()]
    .map(([memberId, memberResources]) => {
      const displayNameFromResource = memberResources.find(
        (resource) => resource.sharedByDisplayName?.trim(),
      )?.sharedByDisplayName

      return {
        memberId,
        displayName:
          displayNameFromResource?.trim() ||
          resolveMemberDisplayName(memberId, members, unknownMemberLabel),
        isSelf: selfMemberId != null && memberId === selfMemberId,
        resources: memberResources,
      }
    })
    .sort((left, right) => {
      if (left.isSelf !== right.isSelf) return left.isSelf ? -1 : 1
      return left.displayName.localeCompare(right.displayName, 'zh-CN')
    })
}
