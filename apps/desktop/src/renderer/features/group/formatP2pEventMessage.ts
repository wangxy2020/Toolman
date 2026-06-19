import type { P2pEventType, P2pResourceType, WorkspaceEvent } from '@toolman/shared'

export const P2P_RESOURCE_LABELS: Record<P2pResourceType, string> = {
  Workspace: '群组',
  Member: '成员',
  Knowledge: '知识库',
  Note: '笔记',
  Agent: '智能体',
  File: '文件',
  Workflow: '工作流',
}

const EVENT_TYPE_LABELS: Record<P2pEventType, string> = {
  Created: '创建',
  Updated: '更新',
  Deleted: '删除',
  Shared: '共享',
  Joined: '加入',
  Left: '离开',
}

function readString(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}

export function formatP2pEventMessage(event: WorkspaceEvent): string {
  const payload = event.payload

  if (event.resourceType === 'Workspace' && event.eventType === 'Created') {
    return `创建了群组「${readString(payload, 'name', '未命名群组')}」`
  }

  if (event.resourceType === 'Workspace' && event.eventType === 'Updated') {
    const name = readString(payload, 'name', '')
    return name ? `更新了群组信息「${name}」` : '更新了群组信息'
  }

  if (event.resourceType === 'Member' && event.eventType === 'Joined') {
    return `${readString(payload, 'display_name', '新成员')} 加入了群组`
  }

  if (event.resourceType === 'Member' && event.eventType === 'Left') {
    return `${readString(payload, 'display_name', '成员')} 离开了群组`
  }

  if (event.eventType === 'Shared') {
    const name = readString(payload, 'name', readString(payload, 'resource_name', ''))
    const resourceLabel = P2P_RESOURCE_LABELS[event.resourceType]
    return name ? `共享了${resourceLabel}「${name}」` : `共享了${resourceLabel}`
  }

  if (event.resourceType === 'File' && event.eventType === 'Created') {
    return `上传了文件「${readString(payload, 'name', readString(payload, 'file_name', '未命名文件'))}」`
  }

  if (event.resourceType === 'Knowledge' && event.eventType === 'Updated') {
    return `同步了知识库文档「${readString(payload, 'title', '未命名文档')}」`
  }

  if (event.resourceType === 'Knowledge' && event.eventType === 'Deleted') {
    return '取消了知识库共享'
  }

  const resourceLabel = P2P_RESOURCE_LABELS[event.resourceType]
  const eventLabel = EVENT_TYPE_LABELS[event.eventType]
  return `${resourceLabel} ${eventLabel}`
}

export function formatP2pEventTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp
  if (diff < 0) return formatAbsoluteTime(timestamp)
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return formatAbsoluteTime(timestamp)
}

export function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function shortDeviceId(deviceId: string): string {
  if (deviceId.length <= 16) return deviceId
  return `${deviceId.slice(0, 8)}…${deviceId.slice(-4)}`
}
