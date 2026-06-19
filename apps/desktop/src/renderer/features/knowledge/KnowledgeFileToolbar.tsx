import { IconSort } from '../../components/icons'
import {
  KNOWLEDGE_FILE_SORT_OPTIONS,
  type KnowledgeFileSortField,
} from './knowledge-file-sort'

interface Props {
  sortField: KnowledgeFileSortField
  sortAscending: boolean
  onSortFieldChange: (field: KnowledgeFileSortField) => void
}

export function KnowledgeFileToolbar({
  sortField,
  sortAscending,
  onSortFieldChange,
}: Props) {
  return (
    <div className="tm-kb-file-toolbar">
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
