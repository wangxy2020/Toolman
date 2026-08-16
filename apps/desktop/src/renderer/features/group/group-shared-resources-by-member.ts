import { memberIdentityKey, type P2pMember, type P2pSharedResource } from '@toolman/shared'

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

function personKeyForShare(sharedBy: string, members: P2pMember[]): string {
  const member = members.find((item) => item.id === sharedBy)
  return member ? memberIdentityKey(member) : sharedBy
}

export function groupResourcesByMember(
  resources: P2pSharedResource[],
  members: P2pMember[],
  selfMemberId: string | null,
  unknownMemberLabel: string,
): GroupMemberResourceSection[] {
  const byPerson = new Map<string, P2pSharedResource[]>()

  for (const resource of resources) {
    const personKey = personKeyForShare(resource.sharedBy, members)
    const bucket = byPerson.get(personKey) ?? []
    bucket.push(resource)
    byPerson.set(personKey, bucket)
  }

  const self = members.find((item) => item.id === selfMemberId)

  return [...byPerson.entries()]
    .map(([personKey, memberResources]) => {
      const displayNameFromResource = memberResources.find(
        (resource) => resource.sharedByDisplayName?.trim(),
      )?.sharedByDisplayName
      const personMember =
        members.find((item) => memberIdentityKey(item) === personKey) ??
        members.find((item) => item.id === personKey)

      return {
        memberId: personMember?.id ?? personKey,
        displayName:
          displayNameFromResource?.trim() ||
          personMember?.displayName?.trim() ||
          resolveMemberDisplayName(personKey, members, unknownMemberLabel),
        isSelf:
          selfMemberId != null &&
          (personKey === selfMemberId ||
            (self != null && memberIdentityKey(self) === personKey)),
        resources: memberResources,
      }
    })
    .sort((left, right) => {
      if (left.isSelf !== right.isSelf) return left.isSelf ? -1 : 1
      return left.displayName.localeCompare(right.displayName, 'zh-CN')
    })
}
