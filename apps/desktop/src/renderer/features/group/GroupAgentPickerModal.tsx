import { useMemo } from 'react'
import type { Assistant, P2pSharedResource, Session } from '@toolman/shared'
import { modelNameFromId } from '../chat/model-utils'
import { formatKnowledgeDocTime } from '../knowledge/knowledge-file-display'
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

interface Props {
  assistants: Assistant[]
  sessions: Session[]
  sharedResources: P2pSharedResource[]
  onClose: () => void
  onConfirm: (
    selections: Array<{ assistantId: string; sessionIds?: string[] }>,
  ) => Promise<void>
}

export function GroupAgentPickerModal({
  assistants,
  sessions,
  sharedResources,
  onClose,
  onConfirm,
}: Props) {
  const sessionsByAssistantId = useMemo(() => {
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
  }, [sessions])

  const sharedSessionMap = useMemo(
    () => buildSharedSessionMap(sharedResources),
    [sharedResources],
  )

  const groups = useMemo<GroupPickerGroup[]>(() => {
    const result: GroupPickerGroup[] = []

    for (const assistant of assistants) {
      if (!isShareableGroupAgentSource(assistant)) continue
      const sharedSessionIds = sharedSessionMap.get(assistant.id)
      if (sharedSessionIds === null) {
        continue
      }

      const assistantSessions = sessionsByAssistantId.get(assistant.id) ?? []
      const availableSessions =
        sharedSessionIds && sharedSessionIds.length > 0
          ? assistantSessions.filter((session) => !sharedSessionIds.includes(session.id))
          : assistantSessions

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
      onClose={onClose}
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
