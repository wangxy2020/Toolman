import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  type ConfigurableSidebarMenuKey,
  getDefaultSidebarMenuPreferences,
  getVisibleSidebarMenuKeys,
  type ProjectSidebarMenuPreferences,
  readProjectSidebarMenuPreferences,
  writeProjectSidebarMenuPreferences,
} from './projectSidebarMenuConfig'

export const useProjectSidebarMenuPreferences = () => {
  const [preferences, setPreferences] = useState<ProjectSidebarMenuPreferences>(() =>
    readProjectSidebarMenuPreferences(),
  )

  useEffect(() => {
    writeProjectSidebarMenuPreferences(preferences)
  }, [preferences])

  const visibleMenuKeys = useMemo(() => getVisibleSidebarMenuKeys(preferences), [preferences])

  const setMenuVisible = useCallback((key: ConfigurableSidebarMenuKey, visible: boolean) => {
    setPreferences((prev) => {
      const order = [...prev.order]
      const hidden = new Set(prev.hidden)
      if (visible) {
        hidden.delete(key)
      } else {
        const wouldHide = order.filter((item) => item !== key && !hidden.has(item)).length
        if (wouldHide === 0) {
          return prev
        }
        hidden.add(key)
      }
      return { order, hidden: [...hidden] }
    })
  }, [])

  const moveMenu = useCallback((key: ConfigurableSidebarMenuKey, direction: 'up' | 'down') => {
    setPreferences((prev) => {
      const order = [...prev.order]
      const index = order.indexOf(key)
      if (index < 0) {
        return prev
      }
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= order.length) {
        return prev
      }
      const swapped = order[targetIndex]
      if (!swapped) {
        return prev
      }
      order[index] = swapped
      order[targetIndex] = key
      return { ...prev, order }
    })
  }, [])

  const resetToDefaults = useCallback(() => {
    setPreferences(getDefaultSidebarMenuPreferences())
  }, [])

  return {
    preferences,
    visibleMenuKeys,
    setMenuVisible,
    moveMenu,
    resetToDefaults,
  }
}
