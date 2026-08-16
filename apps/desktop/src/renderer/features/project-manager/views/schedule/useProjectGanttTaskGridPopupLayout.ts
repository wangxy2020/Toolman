import { useLayoutEffect, type RefObject } from 'react'
import type {
  CostAssignPopupState,
  CostNamePickerState,
  ResourceAssignPopupState,
  ResourceCellPickerState,
} from './pm-gantt-task-grid-utils'

export function useProjectGanttTaskGridPopupLayout(args: {
  resourceCellPicker: ResourceCellPickerState | null
  resourceCellPickerMenuRef: RefObject<HTMLDivElement | null>
  costNamePicker: CostNamePickerState | null
  costNamePickerMenuRef: RefObject<HTMLDivElement | null>
  resourceAssignPopup: ResourceAssignPopupState | null
  resourceAssignPopupRef: RefObject<HTMLDivElement | null>
  costAssignPopup: CostAssignPopupState | null
  costAssignPopupRef: RefObject<HTMLDivElement | null>
}) {
  const {
    resourceCellPicker,
    resourceCellPickerMenuRef,
    costNamePicker,
    costNamePickerMenuRef,
    resourceAssignPopup,
    resourceAssignPopupRef,
    costAssignPopup,
    costAssignPopupRef,
  } = args

  useLayoutEffect(() => {
    const menu = resourceCellPickerMenuRef.current
    if (!resourceCellPicker || !menu) return

    const margin = 8
    const gap = 2
    const spaceBelow = window.innerHeight - resourceCellPicker.anchorBottom - margin
    const spaceAbove = resourceCellPicker.anchorTop - margin

    menu.style.maxHeight = `${Math.min(320, Math.max(120, spaceBelow, spaceAbove))}px`
    let height = menu.offsetHeight
    const openAbove = height > spaceBelow && spaceAbove > spaceBelow
    menu.style.maxHeight = `${Math.min(320, Math.max(120, openAbove ? spaceAbove : spaceBelow))}px`
    height = menu.offsetHeight

    const width = Math.max(menu.offsetWidth, resourceCellPicker.minWidth)
    let top = openAbove
      ? resourceCellPicker.anchorTop - height - gap
      : resourceCellPicker.anchorBottom + gap
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    let left = resourceCellPicker.left
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

    menu.style.top = `${top}px`
    menu.style.left = `${left}px`
  }, [resourceCellPicker, resourceCellPickerMenuRef])

  useLayoutEffect(() => {
    const menu = costNamePickerMenuRef.current
    if (!costNamePicker || !menu) return

    const margin = 8
    const gap = 2
    const spaceBelow = window.innerHeight - costNamePicker.anchorBottom - margin
    const spaceAbove = costNamePicker.anchorTop - margin

    menu.style.overflowX = 'hidden'
    menu.style.overflowY = 'auto'
    menu.style.maxHeight = `${Math.min(320, Math.max(120, spaceBelow, spaceAbove))}px`
    let height = menu.offsetHeight
    const openAbove = height > spaceBelow && spaceAbove > spaceBelow
    const sideBudget = openAbove ? spaceAbove : spaceBelow
    menu.style.maxHeight = `${Math.min(320, Math.max(120, sideBudget))}px`
    height = menu.offsetHeight

    const width = Math.max(menu.offsetWidth, costNamePicker.minWidth)
    let top = openAbove
      ? costNamePicker.anchorTop - height - gap
      : costNamePicker.anchorBottom + gap
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    let left = costNamePicker.left
    const flyoutPad = 188
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - width - flyoutPad - margin),
    )

    menu.style.top = `${top}px`
    menu.style.left = `${left}px`

    const submenu = menu.querySelector(
      '.tm-pm-gantt-resource-select-submenu',
    ) as HTMLElement | null
    const sectionBtn = menu.querySelector(
      '.tm-pm-gantt-resource-select-menu-item--group[aria-expanded="true"]',
    ) as HTMLElement | null
    if (!submenu || !sectionBtn) return

    const anchor = sectionBtn.getBoundingClientRect()
    submenu.style.position = 'fixed'
    submenu.style.right = 'auto'
    submenu.style.bottom = 'auto'
    submenu.style.maxHeight = `${Math.min(280, window.innerHeight - margin * 2)}px`

    const subWidth = Math.max(submenu.offsetWidth, 168)
    let subLeft = anchor.right - 4
    if (subLeft + subWidth > window.innerWidth - margin) {
      subLeft = Math.max(margin, anchor.left - subWidth + 4)
    }

    let subTop = anchor.top - 4
    const subHeight = Math.min(
      submenu.scrollHeight,
      Math.min(280, window.innerHeight - margin * 2),
    )
    if (subTop + subHeight > window.innerHeight - margin) {
      subTop = Math.max(margin, window.innerHeight - margin - subHeight)
    }
    subTop = Math.max(margin, subTop)

    submenu.style.top = `${subTop}px`
    submenu.style.left = `${subLeft}px`
  }, [costNamePicker, costNamePickerMenuRef])

  useLayoutEffect(() => {
    const popup = resourceAssignPopupRef.current
    if (!resourceAssignPopup || !popup) return

    const margin = 8
    const maxViewportHeight = Math.max(160, window.innerHeight - margin * 2)
    popup.style.maxHeight = `${maxViewportHeight}px`

    const width = popup.offsetWidth
    const height = popup.offsetHeight
    const spaceBelow = window.innerHeight - resourceAssignPopup.anchorY - margin
    const spaceAbove = resourceAssignPopup.anchorY - margin
    const openAbove = height > spaceBelow && spaceAbove > spaceBelow

    let top = openAbove
      ? resourceAssignPopup.anchorY - height
      : resourceAssignPopup.anchorY
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    let left = resourceAssignPopup.left
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

    popup.style.top = `${top}px`
    popup.style.left = `${left}px`
  }, [resourceAssignPopup, resourceAssignPopupRef])

  useLayoutEffect(() => {
    const popup = costAssignPopupRef.current
    if (!costAssignPopup || !popup) return

    const margin = 8
    const maxViewportHeight = Math.max(160, window.innerHeight - margin * 2)
    popup.style.maxHeight = `${maxViewportHeight}px`

    const width = popup.offsetWidth
    const height = popup.offsetHeight
    const spaceBelow = window.innerHeight - costAssignPopup.anchorY - margin
    const spaceAbove = costAssignPopup.anchorY - margin
    const openAbove = height > spaceBelow && spaceAbove > spaceBelow

    let top = openAbove ? costAssignPopup.anchorY - height : costAssignPopup.anchorY
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    let left = costAssignPopup.left
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

    popup.style.top = `${top}px`
    popup.style.left = `${left}px`
  }, [costAssignPopup, costAssignPopupRef])
}
