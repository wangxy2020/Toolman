import { useCallback, useState } from 'react'

import type { CommunityListSortField } from './community-list-sort'

export function useCommunityListSort(defaultField: CommunityListSortField = 'createdAt') {
  const [sortField, setSortField] = useState<CommunityListSortField>(defaultField)
  const [sortAscending, setSortAscending] = useState(false)

  const handleSortFieldChange = useCallback(
    (field: CommunityListSortField) => {
      if (field === sortField) {
        setSortAscending((current) => !current)
        return
      }
      setSortField(field)
      setSortAscending(field === 'name')
    },
    [sortField],
  )

  return {
    sortField,
    sortAscending,
    handleSortFieldChange,
  }
}
