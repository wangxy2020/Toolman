import type { Assistant, P2pSharedResource } from '@toolman/shared'
import { IconAgent, IconTrash } from '../../components/icons'
import { modelNameFromId } from '../chat/model-utils'
import { GroupFileSelectCheckbox } from './GroupFileSelectCheckbox'

interface AgentListItem {
  resource: P2pSharedResource
  assistant: Assistant | null
}

interface Props {
  items: AgentListItem[]
  selectedIds: Set<string>
  canDeleteAgent: (resource: P2pSharedResource) => boolean
  removingId?: string | null
  onToggleSelect: (resourceId: string) => void
  onRemove: (resourceId: string) => void
  onContextMenu?: (event: React.MouseEvent) => void
}

function buildDescription(assistant: Assistant | null, resource: P2pSharedResource): string {
  if (assistant?.description?.trim()) return assistant.description.trim()
  if (assistant?.modelId) return modelNameFromId(assistant.modelId)
  return resource.name
}

export function GroupAgentList({
  items,
  selectedIds,
  canDeleteAgent,
  removingId,
  onToggleSelect,
  onRemove,
  onContextMenu,
}: Props) {
  return (
    <ul className="tm-kb-file-list" onContextMenu={onContextMenu}>
      {items.map(({ resource, assistant }) => {
        const title = assistant?.name ?? resource.name
        const removing = removingId === resource.id
        const selected = selectedIds.has(resource.id)
        const canDelete = canDeleteAgent(resource)

        return (
          <li
            key={resource.id}
            className={[
              'tm-kb-file-card',
              'tm-group-file-card',
              selected ? 'tm-kb-file-card--selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="tm-kb-file-card-icon tm-kb-file-card-icon--md">
              <IconAgent size={18} />
            </div>

            <div className="tm-kb-file-card-main">
              <div className="tm-kb-file-card-title" title={title}>
                {title}
              </div>
              <div className="tm-kb-file-card-meta">{buildDescription(assistant, resource)}</div>
            </div>

            {canDelete ? (
              <div className="tm-kb-file-card-actions">
                <button
                  type="button"
                  className="tm-kb-file-card-action tm-kb-file-card-action--danger"
                  title="从群组移除"
                  disabled={removing}
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemove(resource.id)
                  }}
                >
                  <IconTrash size={16} />
                </button>
                <GroupFileSelectCheckbox
                  checked={selected}
                  onChange={() => onToggleSelect(resource.id)}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
