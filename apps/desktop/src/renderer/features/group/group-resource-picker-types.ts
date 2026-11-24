export interface GroupPickerItem {
  id: string
  name: string
  meta?: string
  disabled?: boolean
  /** Render as read-only row without checkbox (not included in selection). */
  displayOnly?: boolean
}

export interface GroupPickerGroup {
  id: string
  name: string
  description?: string
  items: GroupPickerItem[]
  disabled?: boolean
  /** Allow selecting the group row when child items are display-only (e.g. agent topics). */
  groupSelectable?: boolean
  /** Item count when the group is selected before child rows are loaded. */
  selectableCount?: number
  /**
   * Knowledge-sidebar section header (本地/同步/网络…).
   * Not selectable and not expandable — folders under it are separate groups.
   */
  sectionHeader?: boolean
  /** Visual nest level under a section (0 = top-level / section). */
  depth?: number
}

export interface GroupPickerSelection {
  groupId: string
  itemIds: string[]
}
