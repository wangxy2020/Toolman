import { IconAgent, IconSort, IconTranslate } from '../../components/icons'
import { HeaderIconButton } from '../../components/layout/HeaderIconButton'
import { useI18n } from '../../i18n/useI18n'
import {
  getKnowledgeFileSortOptions,
  type KnowledgeFileSortField,
} from './knowledge-file-sort'

interface Props {
  sortField: KnowledgeFileSortField
  sortAscending: boolean
  onSortFieldChange: (field: KnowledgeFileSortField) => void
  onTranslateWithFiles?: () => void
  translateDisabled?: boolean
  onChatWithFiles?: () => void
  chatDisabled?: boolean
}

export function KnowledgeFileToolbar({
  sortField,
  sortAscending,
  onSortFieldChange,
  onTranslateWithFiles,
  translateDisabled = false,
  onChatWithFiles,
  chatDisabled = false,
}: Props) {
  const { t } = useI18n()
  const sortOptions = getKnowledgeFileSortOptions(t)

  return (
    <div className="tm-kb-file-toolbar">
      {onTranslateWithFiles ? (
        <HeaderIconButton
          label={t('knowledgePage.toolbar.translateWithFiles')}
          disabled={translateDisabled}
          onClick={onTranslateWithFiles}
        >
          <IconTranslate size={16} />
        </HeaderIconButton>
      ) : null}
      {onChatWithFiles ? (
        <HeaderIconButton
          label={t('knowledgePage.toolbar.chatWithFiles')}
          disabled={chatDisabled}
          onClick={onChatWithFiles}
        >
          <IconAgent size={16} />
        </HeaderIconButton>
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
