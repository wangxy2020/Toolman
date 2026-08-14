import { useWindowDimensions } from 'react-native'

/** Shortest edge ≥ 600 ≈ iPad / large tablets (portrait or landscape). */
export const TABLET_SHORTEST_EDGE = 600

/** Match desktop `--tm-sidebar-width` (module sidebar and settings nav). */
export const SIDEBAR_WIDTH = 200

export type SidebarLayout = {
  isTablet: boolean
  /** Agent / notes / settings left column width. */
  sidebarWidth: number
  /** “新建话题” and topic row shared touch height. */
  rowMinHeight: number
  addFontSize: number
  addIconSize: number
  topicFontSize: number
  swipeActionWidth: number
}

export function getSidebarLayout(width: number, height: number): SidebarLayout {
  const shortest = Math.min(width, height)
  const isTablet = shortest >= TABLET_SHORTEST_EDGE
  return {
    isTablet,
    sidebarWidth: SIDEBAR_WIDTH,
    // Top module capsule ≈ track padding (3+3) + nav chip minHeight 32 → ~38.
    // Sidebar rows must not exceed that outer frame.
    rowMinHeight: 34,
    // Top module menu uses 13px; sidebar copy should sit slightly below that.
    addFontSize: 12,
    addIconSize: 14,
    topicFontSize: 12,
    swipeActionWidth: isTablet ? 80 : 72,
  }
}

export function useSidebarLayout(): SidebarLayout {
  const { width, height } = useWindowDimensions()
  return getSidebarLayout(width, height)
}
