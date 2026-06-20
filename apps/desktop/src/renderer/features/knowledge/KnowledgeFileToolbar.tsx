import { IconAgent, IconSort } from '../../components/icons'
import {
  KNOWLEDGE_FILE_SORT_OPTIONS,
  type KnowledgeFileSortField,
} from './knowledge-file-sort'

interface Props {
  sortField: KnowledgeFileSortField
  sortAscending: boolean
  onSortFieldChange: (field: KnowledgeFileSortField) => void
  onChatWithFiles?: () => void
  chatDisabled?: boolean
}

export function KnowledgeFileToolbar({
  sortField,
  sortAscending,
  onSortFieldChange,
  onChatWithFiles,
  chatDisabled = false,
}: Props) {
  return (
    <div className="tm-kb-file-toolbar">
      {onChatWithFiles ? (
        <button
          type="button"
          className="tm-chat-header-settings-btn"
          title="带着知识库文件去聊天"
          aria-label="带着知识库文件去聊天"
          disabled={chatDisabled}
          onClick={onChatWithFiles}
        >
          <IconAgent size={16} />
        </button>
      ) : null}
      <div className="tm-kb-file-toolbar-sort">
        {KNOWLEDGE_FILE_SORT_OPTIONS.map((option) => {
          const active = sortField === option.id
          return (
            <button
              key={option.id}
              type="button"
              className={[
                'tm-kb-file-toolbar-sort-item',
                active ? 'tm-kb-file-toolbar-sort-item--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSortFieldChange(option.id)}
            >
              <span>{option.label}</span>
              {active ? <IconSort size={14} ascending={sortAscending} /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
