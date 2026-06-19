import { createContext, useContext, type ReactNode } from 'react'

import type { CommunityListSortField } from './community-list-sort'
import { useCommunityListSort } from './useCommunityListSort'

interface CommunityListSortContextValue {
  sortField: CommunityListSortField
  sortAscending: boolean
  handleSortFieldChange: (field: CommunityListSortField) => void
}

const CommunityListSortContext = createContext<CommunityListSortContextValue | null>(null)

export function CommunityListSortProvider({ children }: { children: ReactNode }) {
  const sort = useCommunityListSort()

  return (
    <CommunityListSortContext.Provider value={sort}>{children}</CommunityListSortContext.Provider>
  )
}

export function useCommunityListSortContext() {
  const context = useContext(CommunityListSortContext)
  if (!context) {
    throw new Error('useCommunityListSortContext must be used within CommunityListSortProvider')
  }
  return context
}
