import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Assistant, P2pSharedResource, Session } from '@toolman/shared'
import { modelNameFromId } from '../chat/model-utils'
import { formatKnowledgeDocTime } from '../knowledge/knowledge-file-display'
import { listAllAssistantSessions } from './group-assistant-session-list'
import { isShareableGroupAgentSource } from './group-agent-utils'
import type { GroupPickerGroup } from './group-resource-picker-types'
import { GroupResourcePickerModal } from './GroupResourcePickerModal'

/** `undefined` = not shared; `null` = whole agent shared; `string[]` = partially shared session ids */
type SharedSessionState = string[] | null | undefined

function buildSharedSessionMap(
  sharedResources: P2pSharedResource[],
): Map<string, SharedSessionState> {
  const map = new Map<string, SharedSessionState>()
  for (const resource of sharedResources) {
    if (resource.resourceType !== 'Agent') continue
    const assistantId = resource.localResourceId ?? resource.id
    map.set(assistantId, resource.sharedSessionIds ?? null)
  }
  return map
}

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort(
    (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
  )
}

function groupSessionsByAssistant(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>()
  for (const session of sessions) {
    if (!session.assistantId) continue
    const list = map.get(session.assistantId) ?? []
    list.push(session)
    map.set(session.assistantId, list)
  }
  for (const list of map.values()) {
    list.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
  }
  return map
}

function filterAvailableSessions(
  assistantId: string,
  sessions: Session[],
  sharedSessionMap: Map<string, SharedSessionState>,
): Session[] {
  const sharedSessionIds = sharedSessionMap.get(assistantId)
  if (sharedSessionIds && sharedSessionIds.length > 0) {
    return sortSessions(sessions).filter((session) => !sharedSessionIds.includes(session.id))
  }
  return sortSessions(sessions)
}

interface Props {
  assistants: Assistant[]
  sessions: Session[]
  sharedResources: P2pSharedResource[]
  sourceWorkspaceId: string | null
  onClose: () => void
  onConfirm: (
    selections: Array<{ assistantId: string; sessionIds?: string[] }>,
  ) => Promise<void>
}

export function GroupAgentPickerModal({
  assistants,
  sessions,
  sharedResources,
  sourceWorkspaceId,
  onClose,
  onConfirm,
}: Props) {
  const [sessionsByAssistantId, setSessionsByAssistantId] = useState(() =>
    groupSessionsByAssistant(sessions),
  )
  const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadedAssistantIdsRef = useRef(new Set<string>())

  const sharedSessionMap = useMemo(
    () => buildSharedSessionMap(sharedResources),
    [sharedResources],
  )

  useEffect(() => {
    setSessionsByAssistantId((current) => {
      const next = new Map(current)
      for (const [assistantId, assistantSessions] of groupSessionsByAssistant(sessions)) {
        if (!next.has(assistantId)) {
          next.set(assistantId, assistantSessions)
        }
      }
      return next
    })
  }, [sessions])

  const refreshAssistantSessions = useCallback(
    async (assistantId: string) => {
      if (!sourceWorkspaceId) return

      setLoadingGroupId(assistantId)
      setLoadError(null)
      try {
        const allSessions = await listAllAssistantSessions(sourceWorkspaceId, assistantId)
        loadedAssistantIdsRef.current.add(assistantId)
        setSessionsByAssistantId((current) => {
          const next = new Map(current)
          next.set(assistantId, allSessions)
          return next
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : '加载话题失败'
        setLoadError(message)
      } finally {
        setLoadingGroupId(null)
      }
    },
    [sourceWorkspaceId],
  )

  useEffect(() => {
    if (!sourceWorkspaceId) return

    for (const assistant of assistants) {
      if (!isShareableGroupAgentSource(assistant)) continue
      if (sharedSessionMap.get(assistant.id) === null) continue
      if (loadedAssistantIdsRef.current.has(assistant.id)) continue
      void refreshAssistantSessions(assistant.id)
    }
  }, [assistants, refreshAssistantSessions, sharedSessionMap, sourceWorkspaceId])

  const groups = useMemo<GroupPickerGroup[]>(() => {
    const result: GroupPickerGroup[] = []

    for (const assistant of assistants) {
      if (!isShareableGroupAgentSource(assistant)) continue

      const sharedSessionIds = sharedSessionMap.get(assistant.id)
      if (sharedSessionIds === null) {
        continue
      }

      const assistantSessions = sessionsByAssistantId.get(assistant.id) ?? []
      const availableSessions = filterAvailableSessions(
        assistant.id,
        assistantSessions,
        sharedSessionMap,
      )

      if (sharedSessionIds && availableSessions.length === 0) {
        continue
      }

      const modelLabel = assistant.modelId ? modelNameFromId(assistant.modelId) : null
      const descriptionParts = [
        `${availableSessions.length} 个可添加话题`,
        assistant.description?.trim(),
        modelLabel,
      ].filter(Boolean)

      result.push({
        id: assistant.id,
        name: assistant.name,
        description: descriptionParts.join(' · '),
        groupSelectable: availableSessions.length === 0,
        items: availableSessions.map((session) => ({
          id: session.id,
          name: session.title,
          meta: formatKnowledgeDocTime(session.updatedAt ?? session.createdAt),
        })),
      })
    }

    return result
  }, [assistants, sessionsByAssistantId, sharedSessionMap])

  return (
    <GroupResourcePickerModal
      title="选择智能体"
      hint="展开智能体可查看未共享话题，勾选智能体或话题将添加到群组。"
      confirmLabel="添加"
      groups={groups}
      loadingGroupId={loadingGroupId}
      error={loadError}
      onClose={onClose}
      onGroupExpand={(groupId) => void refreshAssistantSessions(groupId)}
      onConfirm={async (selection) => {
        const payload = selection.map(({ groupId, itemIds }) => ({
          assistantId: groupId,
          sessionIds: itemIds.length > 0 ? itemIds : undefined,
        }))
        if (payload.length === 0) {
          throw new Error('请先选择要添加的智能体或话题')
        }
        await onConfirm(payload)
      }}
    />
  )
}
