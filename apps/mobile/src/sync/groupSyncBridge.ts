import {
  loadGroupChatStore,
  saveGroupChatStore,
  type GroupChatStore,
  type GroupMember,
  type GroupWorkspace,
} from '../storage/groupChat'

export type GroupSyncSnapshot = {
  groups: GroupWorkspace[]
  membersByGroup: Record<string, GroupMember[]>
  activeGroupId: string | null
}

type Reader = () => Pick<GroupSyncSnapshot, 'groups' | 'membersByGroup'>

let reader: Reader | null = null
let lastSnapshot: GroupSyncSnapshot | null = null
const listeners = new Set<(snapshot: GroupSyncSnapshot) => void>()

export function setGroupSyncLocalReader(next: Reader | null): void {
  reader = next
}

export function peekGroupSync(): GroupSyncSnapshot | null {
  return lastSnapshot
}

export function resetGroupSyncSnapshot(): void {
  lastSnapshot = null
}

export function subscribeGroupSync(
  listener: (snapshot: GroupSyncSnapshot) => void,
): () => void {
  listeners.add(listener)
  if (lastSnapshot) listener(lastSnapshot)
  return () => {
    listeners.delete(listener)
  }
}

export function emitGroupSync(snapshot: GroupSyncSnapshot): void {
  lastSnapshot = snapshot
  for (const listener of listeners) listener(snapshot)
}

export async function readGroupSyncBaseline(): Promise<GroupChatStore> {
  const store = await loadGroupChatStore()
  const live = reader?.()
  if (!live) return store
  return {
    ...store,
    groups: live.groups,
    membersByGroup: live.membersByGroup,
  }
}

export async function persistGroupSyncSnapshot(
  store: GroupChatStore,
  snapshot: GroupSyncSnapshot,
): Promise<void> {
  await saveGroupChatStore({
    ...store,
    groups: snapshot.groups,
    membersByGroup: snapshot.membersByGroup,
    activeGroupId: snapshot.activeGroupId,
  })
}
