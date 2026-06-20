import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import {
  DEFAULT_SUB_TAB_BY_CATEGORY,
  type ModerationCategory,
  type ModerationSubTab,
} from './community-moderation-utils'

type CommunityModerationCategoryContextValue = {
  category: ModerationCategory
  subTab: ModerationSubTab
  setSubTab: (subTab: ModerationSubTab) => void
  handleCategoryChange: (category: ModerationCategory) => void
}

const CommunityModerationCategoryContext =
  createContext<CommunityModerationCategoryContextValue | null>(null)

export function CommunityModerationCategoryProvider({ children }: { children: ReactNode }) {
  const [category, setCategory] = useState<ModerationCategory>('resources')
  const [subTab, setSubTab] = useState<ModerationSubTab>(DEFAULT_SUB_TAB_BY_CATEGORY.resources)

  const handleCategoryChange = useCallback((nextCategory: ModerationCategory) => {
    setCategory(nextCategory)
    setSubTab(DEFAULT_SUB_TAB_BY_CATEGORY[nextCategory] as ModerationSubTab)
  }, [])

  const value = useMemo(
    () => ({
      category,
      subTab,
      setSubTab,
      handleCategoryChange,
    }),
    [category, handleCategoryChange, subTab],
  )

  return (
    <CommunityModerationCategoryContext.Provider value={value}>
      {children}
    </CommunityModerationCategoryContext.Provider>
  )
}

export function useCommunityModerationCategory() {
  const context = useContext(CommunityModerationCategoryContext)
  if (!context) {
    throw new Error('useCommunityModerationCategory must be used within CommunityModerationCategoryProvider')
  }
  return context
}

export function useCommunityModerationCategoryOptional() {
  return useContext(CommunityModerationCategoryContext)
}
