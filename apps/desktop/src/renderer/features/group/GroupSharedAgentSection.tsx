import { useEffect, useMemo, useState } from 'react'
import type { Assistant, P2pSharedResource, Session } from '@toolman/shared'
import { IconChevronRight, IconTrash } from '../../components/icons'
import { modelNameFromId } from '../chat/model-utils'
import { GroupAgentSessionList } from './GroupAgentSessionList'
import { GroupFileSelectCheckbox } from './GroupFileSelectCheckbox'
import { agentSelectionKey } from './group-agent-selection'
import { resolveSharedAgentSessions } from './group-agent-utils'
import type { OpenGroupAgentSessionRequest } from './group-agent-open'

interface Props {
  resource: P2pSharedResource
  assistant: Assistant | null
  sessions: Session[]
  selectedKeys: Set<string>
  canDelete: boolean
  removingResourceId?: string | null
  removingSessionId?: string | null
  onToggleSelect: (selectionKey: string) => void
  onToggleSelectSection: (selectionKeys: string[]) => void
  onRemoveAgent: () => void
  onRemoveSession: (sessionId: string) => void
  onOpenSession?: (request: OpenGroupAgentSessionRequest) => void | Promise<void>
  buildOpenSessionRequest: (session: Session) => OpenGroupAgentSessionRequest
  onOpenSessionMenu?: (
    resource: P2pSharedResource,
    sessionId: string,
    anchor: { x: number; y: number; align: 'bottom-start' },
  ) => void
  onContextMenu?: (event: React.MouseEvent) => void
  onSectionKeysChange?: (resourceId: string, keys: string[]) => void
}

function buildMeta(assistant: Assistant | null, sessionCount: number): string {
  const parts = [`${sessionCount} 个话题`]
  if (assistant?.modelId) {
    parts.push(modelNameFromId(assistant.modelId))
  }
  return parts.join(' · ')
}

export function GroupSharedAgentSection({
  resource,
  assistant,
  sessions,
  selectedKeys,
  canDelete,
  removingResourceId,
  removingSessionId,
  onToggleSelect,
  onToggleSelectSection,
  onRemoveAgent,
  onRemoveSession,
  onOpenSession,
  buildOpenSessionRequest,
  onOpenSessionMenu,
  onContextMenu,
  onSectionKeysChange,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const assistantId = resource.localResourceId ?? resource.id
  const title = assistant?.name ?? resource.name

  const panelSessions = useMemo(
    () => resolveSharedAgentSessions(resource, assistantId, sessions),
    [assistantId, resource, sessions],
  )

  const sectionSelectionKeys = useMemo(
    () => panelSessions.map((session) => agentSelectionKey(resource.id, session.id)),
    [panelSessions, resource.id],
  )

  useEffect(() => {
    onSectionKeysChange?.(resource.id, sectionSelectionKeys)
  }, [onSectionKeysChange, resource.id, sectionSelectionKeys])

  const sectionSelectedCount = sectionSelectionKeys.filter((key) => selectedKeys.has(key)).length
  const sectionFullySelected =
    sectionSelectionKeys.length > 0 && sectionSelectedCount === sectionSelectionKeys.length
  const sectionPartiallySelected =
    sectionSelectedCount > 0 && sectionSelectedCount < sectionSelectionKeys.length

  return (
    <section className="tm-group-kb-section">
      <header className="tm-group-kb-section-header">
        <button
          type="button"
          className="tm-group-kb-section-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <IconChevronRight open={expanded} />
        </button>

        <button
          type="button"
          className="tm-group-kb-section-heading"
          onClick={() => setExpanded((current) => !current)}
        >
          <h3 className="tm-group-kb-section-title">{title}</h3>
          <p className="tm-group-kb-section-meta">{buildMeta(assistant, panelSessions.length)}</p>
        </button>

        {canDelete ? (
          <div className="tm-group-kb-section-actions">
            <button
              type="button"
              className="tm-kb-file-card-action tm-kb-file-card-action--danger"
              title="从群组移除智能体"
              disabled={removingResourceId === resource.id}
              onClick={onRemoveAgent}
            >
              <IconTrash size={16} />
            </button>
            <GroupFileSelectCheckbox
              checked={sectionFullySelected}
              title={sectionPartiallySelected ? '部分选中' : '选择智能体下全部话题'}
              onChange={() => onToggleSelectSection(sectionSelectionKeys)}
            />
          </div>
        ) : null}
      </header>

      {expanded ? (
        panelSessions.length === 0 ? (
          <p className="tm-kb-file-panel-empty">暂无共享话题</p>
        ) : (
          <GroupAgentSessionList
            resource={resource}
            resourceId={resource.id}
            sessions={panelSessions}
            selectedKeys={selectedKeys}
            canDelete={canDelete}
            removingSessionId={removingSessionId}
            onToggleSelect={onToggleSelect}
            onRemoveSession={onRemoveSession}
            onOpenSession={onOpenSession}
            buildOpenSessionRequest={buildOpenSessionRequest}
            onOpenSessionMenu={onOpenSessionMenu}
            onContextMenu={onContextMenu}
          />
        )
      ) : null}
    </section>
  )
}
