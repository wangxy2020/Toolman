import type { P2pEventType, P2pResourceType, WorkspaceEvent } from '@toolman/shared'

import { getDateLocale } from './date-locale'
import type { AppLanguage } from '../features/settings/app-settings'
import type { TranslateFn } from './I18nProvider'

function readString(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}

export function getP2pResourceLabel(resourceType: P2pResourceType, t: TranslateFn): string {
  return t(`groupPage.events.resources.${resourceType}`)
}

function getP2pEventTypeLabel(eventType: P2pEventType, t: TranslateFn): string {
  return t(`groupPage.events.types.${eventType}`)
}

export function formatP2pEventMessage(event: WorkspaceEvent, t: TranslateFn): string {
  const payload = event.payload
  const fb = (key: 'unnamedGroup' | 'newMember' | 'member' | 'unnamedFile' | 'unnamedDoc') =>
    t(`groupPage.events.fallbacks.${key}`)

  if (event.resourceType === 'Workspace' && event.eventType === 'Created') {
    return t('groupPage.events.workspaceCreated', {
      name: readString(payload, 'name', fb('unnamedGroup')),
    })
  }

  if (event.resourceType === 'Workspace' && event.eventType === 'Updated') {
    const name = readString(payload, 'name', '')
    return name
      ? t('groupPage.events.workspaceUpdatedNamed', { name })
      : t('groupPage.events.workspaceUpdated')
  }

  if (event.resourceType === 'Member' && event.eventType === 'Joined') {
    return t('groupPage.events.memberJoined', {
      name: readString(payload, 'display_name', fb('newMember')),
    })
  }

  if (event.resourceType === 'Member' && event.eventType === 'Left') {
    return t('groupPage.events.memberLeft', {
      name: readString(payload, 'display_name', fb('member')),
    })
  }

  if (event.eventType === 'Shared') {
    const name = readString(payload, 'name', readString(payload, 'resource_name', ''))
    const resourceLabel = getP2pResourceLabel(event.resourceType, t)
    return name
      ? t('groupPage.events.resourceSharedNamed', { resource: resourceLabel, name })
      : t('groupPage.events.resourceShared', { resource: resourceLabel })
  }

  if (event.resourceType === 'File' && event.eventType === 'Created') {
    return t('groupPage.events.fileUploaded', {
      name: readString(payload, 'name', readString(payload, 'file_name', fb('unnamedFile'))),
    })
  }

  if (event.resourceType === 'Knowledge' && event.eventType === 'Updated') {
    if (payload.document_permission || payload.document_permissions) {
      const permission =
        payload.document_permission === 'savable'
          ? t('groupPage.events.permissions.savable')
          : t('groupPage.events.permissions.readOnly')
      const docTitle = readString(payload, 'title', '')
      return docTitle
        ? t('groupPage.events.kbPermissionUpdatedNamed', { title: docTitle, permission })
        : t('groupPage.events.kbPermissionUpdated', { permission })
    }
    return t('groupPage.events.kbDocSynced', {
      title: readString(payload, 'title', fb('unnamedDoc')),
    })
  }

  if (event.resourceType === 'Knowledge' && event.eventType === 'Deleted') {
    return t('groupPage.events.kbShareRemoved')
  }

  if (event.resourceType === 'GroupChat' && event.eventType === 'Created') {
    const kind = payload.kind
    if (kind === 'group.chat.message') {
      const message = payload.message
      if (message && typeof message === 'object' && message !== null) {
        const senderName =
          typeof (message as { senderName?: unknown }).senderName === 'string'
            ? (message as { senderName: string }).senderName
            : fb('member')
        return t('groupPage.events.chatMessageSent', { sender: senderName })
      }
    }
  }

  const resourceLabel = getP2pResourceLabel(event.resourceType, t)
  const eventLabel = getP2pEventTypeLabel(event.eventType, t)
  return `${resourceLabel} ${eventLabel}`
}

export function formatAbsoluteTime(timestamp: number, language: AppLanguage): string {
  return new Date(timestamp).toLocaleString(getDateLocale(language), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatP2pEventTime(
  timestamp: number,
  t: TranslateFn,
  language: AppLanguage,
  now = Date.now(),
): string {
  const diff = now - timestamp
  if (diff < 0) return formatAbsoluteTime(timestamp, language)
  if (diff < 60_000) return t('groupPage.events.relative.justNow')
  if (diff < 3_600_000) {
    return t('groupPage.events.relative.minutesAgo', { count: Math.floor(diff / 60_000) })
  }
  if (diff < 86_400_000) {
    return t('groupPage.events.relative.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  }
  if (diff < 7 * 86_400_000) {
    return t('groupPage.events.relative.daysAgo', { count: Math.floor(diff / 86_400_000) })
  }
  return formatAbsoluteTime(timestamp, language)
}

export function shortDeviceId(deviceId: string): string {
  if (deviceId.length <= 16) return deviceId
  return `${deviceId.slice(0, 8)}…${deviceId.slice(-4)}`
}
