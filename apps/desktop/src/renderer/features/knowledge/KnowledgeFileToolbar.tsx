import { IconAgent, IconSort } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import {
  getKnowledgeFileSortOptions,
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
  const { t } = useI18n()
  const sortOptions = getKnowledgeFileSortOptions(t)

  return (
    <div className="tm-kb-file-toolbar">
      {onChatWithFiles ? (
        <button
          type="button"
          className="tm-chat-header-settings-btn"
          title={t('knowledgePage.toolbar.chatWithFiles')}
          aria-label={t('knowledgePage.toolbar.chatWithFiles')}
          disabled={chatDisabled}
          onClick={onChatWithFiles}
        >
          <IconAgent size={16} />
        </button>
      ) : null}
      <div className="tm-kb-file-toolbar-sort">
        {sortOptions.map((option) => {
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
