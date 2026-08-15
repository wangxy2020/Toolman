import type { GroupActivity, GroupMember, GroupSharedKind } from '../storage/groupChat'

export function activeGroupMembers(members: GroupMember[]): GroupMember[] {
  return members.filter((member) => member.status === 'active')
}

export function memberAvatarInitial(displayName: string): string {
  return (displayName.trim().slice(0, 1) || '?').toUpperCase()
}

export function memberOnlineLabel(online: boolean, isSelf: boolean): string {
  return online ? (isSelf ? '本机 · 在线' : '在线') : '离线'
}

export function groupSharedPickerHint(kind: GroupSharedKind): string {
  if (kind === 'notes') {
    return '展开笔记本可查看笔记，勾选笔记本将全选其中笔记，也可单独勾选笔记。'
  }
  if (kind === 'knowledge') {
    return '展开知识库可查看未共享文档，勾选知识库将全选可添加文件，也可单独勾选文档。'
  }
  if (kind === 'agents') {
    return '展开智能体可查看未共享话题，勾选智能体或话题将添加到群组。'
  }
  return '勾选要添加到群组的工作流。'
}

export function sortGroupActivities(events: GroupActivity[]): GroupActivity[] {
  return [...events].sort((a, b) => b.timestamp - a.timestamp || b.seq - a.seq)
}
