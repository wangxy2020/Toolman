import type { P2pSharedResource, Session } from '@toolman/shared'
import { IconAccess, IconTrash } from '../../components/icons'
import { formatKnowledgeDocTime } from '../knowledge/knowledge-file-display'
import { GroupFileSelectCheckbox } from './GroupFileSelectCheckbox'
import { agentSelectionKey } from './group-agent-selection'
import {
  formatAgentSessionPermissionLabel,
  getAgentSessionPermission,
} from './group-agent-utils'
import type { OpenGroupAgentSessionRequest } from './group-agent-open'

interface Props {
  resource: P2pSharedResource
  resourceId: string
  sessions: Session[]
  selectedKeys: Set<string>
  canDelete: boolean
  removingSessionId?: string | null
  onToggleSelect: (selectionKey: string) => void
  onRemoveSession: (sessionId: string) => void
  onOpenSession?: (request: OpenGroupAgentSessionRequest) => void | Promise<void>
  buildOpenSessionRequest: (session: Session) => OpenGroupAgentSessionRequest
  onOpenSessionMenu?: (
    resource: P2pSharedResource,
    sessionId: string,
    anchor: { x: number; y: number; align: 'bottom-start' },
  ) => void
  onContextMenu?: (event: React.MouseEvent) => void
}

export function GroupAgentSessionList({
  resource,
  resourceId,
  sessions,
  selectedKeys,
  canDelete,
  removingSessionId,
  onToggleSelect,
  onRemoveSession,
  onOpenSession,
  buildOpenSessionRequest,
  onOpenSessionMenu,
  onContextMenu,
}: Props) {
  return (
    <ul className="tm-kb-file-list" onContextMenu={onContextMenu}>
      {sessions.map((session) => {
        const selectionKey = agentSelectionKey(resourceId, session.id)
        const selected = selectedKeys.has(selectionKey)
        const removing = removingSessionId === session.id
        const permission = getAgentSessionPermission(resource, session.id)

        return (
          <li
            key={session.id}
            className={[
              'tm-kb-file-card',
              'tm-group-file-card',
              selected ? 'tm-kb-file-card--selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="tm-kb-file-card-main">
              <button
                type="button"
                className="tm-kb-file-card-title tm-kb-file-card-title--openable"
                title={session.title}
                onClick={() => onOpenSession?.(buildOpenSessionRequest(session))}
              >
                {session.title}
              </button>
              <div className="tm-kb-file-card-meta">
                {formatKnowledgeDocTime(session.updatedAt ?? session.createdAt)} ·{' '}
                {formatAgentSessionPermissionLabel(permission)}
              </div>
            </div>

            <div className="tm-kb-file-card-actions">
              <button
                type="button"
                className="tm-kb-file-card-action"
                title="话题操作"
                aria-label="话题操作"
                onClick={(event) => {
                  event.stopPropagation()
                  const rect = event.currentTarget.getBoundingClientRect()
                  onOpenSessionMenu?.(resource, session.id, {
                    x: rect.left,
                    y: rect.bottom + 4,
                    align: 'bottom-start',
                  })
                }}
              >
                <IconAccess size={16} />
              </button>
              {canDelete ? (
                <>
                  <button
                    type="button"
                    className="tm-kb-file-card-action tm-kb-file-card-action--danger"
                    title="从群组移除"
                    disabled={removing}
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemoveSession(session.id)
                    }}
                  >
                    <IconTrash size={16} />
                  </button>
                  <GroupFileSelectCheckbox
                    checked={selected}
                    onChange={() => onToggleSelect(selectionKey)}
                  />
                </>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
