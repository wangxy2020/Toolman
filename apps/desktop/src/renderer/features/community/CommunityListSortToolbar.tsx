import { IconSort } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import {
  getCommunityListSortOptions,
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
  const { t } = useI18n()
  const sortOptions = getCommunityListSortOptions(t)

  return (
    <div className="tm-kb-file-toolbar">
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
