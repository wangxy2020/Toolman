import { IconSort } from '../../components/icons'
import {
  COMMUNITY_LIST_SORT_OPTIONS,
  type CommunityListSortField,
} from './community-list-sort'

interface Props {
  sortField: CommunityListSortField
  sortAscending: boolean
  onSortFieldChange: (field: CommunityListSortField) => void
}

export function CommunityListSortToolbar({
  sortField,
  sortAscending,
  onSortFieldChange,
}: Props) {
  return (
    <div className="tm-kb-file-toolbar">
      <div className="tm-kb-file-toolbar-sort">
        {COMMUNITY_LIST_SORT_OPTIONS.map((option) => {
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
