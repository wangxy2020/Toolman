import type { RefObject } from 'react'
import { createPortal } from 'react-dom'

import { IconChevronDown } from '../../../../components/icons'
import {
  encodeCustomResourceViewFilter,
  parseCustomResourceViewFilter,
  PM_RESOURCE_BUILTIN_PRIMARY_TYPES,
} from './pm-resource-catalog'
import type { ResourceViewFilter } from './ProjectResourceMenuBarTypes'

export function ProjectResourceMenuBarViewPanel(props: {
  viewRef: RefObject<HTMLSpanElement | null>
  viewPos: { top: number; left: number } | null
  customViewGroupRef: RefObject<HTMLDivElement | null>
  viewOpen: boolean
  viewMenuLabel: string
  viewCurrentLabel: string
  viewFilter: ResourceViewFilter
  customTypeNames: readonly string[]
  customViewExpanded: boolean
  customViewSubPos: { top: number; left: number } | null
  customViewDraft: string
  canEdit: boolean
  disabled: boolean
  hideTip: () => void
  tipProps: (title: string) => Record<string, unknown>
  t: (key: string) => string
  setViewOpen: (value: boolean | ((open: boolean) => boolean)) => void
  setTypeOpen: (open: boolean) => void
  setBaselineOpen: (open: boolean) => void
  setCustomViewExpanded: (value: boolean | ((open: boolean) => boolean)) => void
  setCustomViewSubPos: (pos: { top: number; left: number } | null) => void
  setCustomViewDraft: (value: string) => void
  onViewFilterChange: (filter: ResourceViewFilter) => void
  onRequestDeleteCustomTypeName: (name: string) => void
  hideCustomViewSubmenu: () => void
  keepCustomViewSubmenu: () => void
  scheduleHideCustomViewSubmenu: () => void
  placeCustomSubmenu: (
    el: HTMLElement,
    opts?: { height?: number },
  ) => { top: number; left: number }
  commitCustomViewTypeName: (name: string) => void
}) {
  return (
    <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={props.viewRef}>
      <button
        type="button"
        className="tm-pm-resource-menubar-btn"
        aria-label={props.viewMenuLabel}
        aria-disabled={props.disabled}
        aria-expanded={props.viewOpen}
        onClick={() => {
          if (props.disabled) return
          props.hideTip()
          props.setTypeOpen(false)
          props.setBaselineOpen(false)
          props.setViewOpen((open) => {
            const next = !open
            if (next) {
              props.setCustomViewExpanded(
                props.customTypeNames.length > 0 ||
                  props.viewFilter === 'custom' ||
                  parseCustomResourceViewFilter(props.viewFilter) != null,
              )
            }
            return next
          })
        }}
        {...props.tipProps(props.viewMenuLabel)}
      >
        <span>{props.viewMenuLabel}</span>
        <span className="tm-pm-gantt-view-current">{props.viewCurrentLabel}</span>
        <IconChevronDown size={14} />
      </button>
      {props.viewOpen && props.viewPos
        ? createPortal(
            <div
              className="tm-pm-gantt-view-panel tm-pm-resource-view-panel"
              role="menu"
              style={{ top: props.viewPos.top, left: props.viewPos.left }}
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={props.viewFilter === 'all'}
                className={[
                  'tm-pm-gantt-view-option',
                  props.viewFilter === 'all' ? 'tm-pm-gantt-view-option--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={props.hideCustomViewSubmenu}
                onClick={() => {
                  props.onViewFilterChange('all')
                  props.setViewOpen(false)
                }}
              >
                {props.t('projectManagerPage.resourceTable.views.allTypes')}
              </button>
              {PM_RESOURCE_BUILTIN_PRIMARY_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="menuitemradio"
                  aria-checked={props.viewFilter === type}
                  className={[
                    'tm-pm-gantt-view-option',
                    props.viewFilter === type ? 'tm-pm-gantt-view-option--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseEnter={props.hideCustomViewSubmenu}
                  onClick={() => {
                    props.onViewFilterChange(type)
                    props.setViewOpen(false)
                  }}
                >
                  {props.t(`projectManagerPage.resourceTable.types.${type}`)}
                </button>
              ))}
              <div
                ref={props.customViewGroupRef}
                className={[
                  'tm-pm-gantt-view-option',
                  'tm-pm-gantt-view-option--group',
                  'tm-pm-resource-type-cell-custom-row',
                  props.viewFilter === 'custom' ? 'tm-pm-gantt-view-option--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="none"
                onMouseEnter={(event) => {
                  props.keepCustomViewSubmenu()
                  props.setCustomViewSubPos(
                    props.placeCustomSubmenu(event.currentTarget, { height: 56 }),
                  )
                }}
                onMouseLeave={props.scheduleHideCustomViewSubmenu}
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={props.viewFilter === 'custom'}
                  className="tm-pm-resource-type-cell-custom-main"
                  onClick={() => {
                    props.onViewFilterChange('custom')
                    const anchor = props.customViewGroupRef.current
                    if (anchor) {
                      props.keepCustomViewSubmenu()
                      props.setCustomViewSubPos(props.placeCustomSubmenu(anchor, { height: 56 }))
                    }
                    if (props.customTypeNames.length > 0) props.setCustomViewExpanded(true)
                  }}
                >
                  {props.t('projectManagerPage.resourceTable.types.custom')}
                </button>
                {props.customTypeNames.length > 0 ? (
                  <button
                    type="button"
                    className="tm-pm-resource-type-cell-fold"
                    aria-expanded={props.customViewExpanded}
                    aria-label={props.t('projectManagerPage.resourceTable.types.custom')}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      props.setCustomViewExpanded((open) => !open)
                    }}
                  >
                    <IconChevronDown
                      size={14}
                      className={[
                        'tm-pm-gantt-view-option-chevron',
                        props.customViewExpanded ? 'tm-pm-gantt-view-option-chevron--open' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    />
                  </button>
                ) : null}
              </div>
              {props.customViewExpanded
                ? props.customTypeNames.map((name) => {
                    const filter = encodeCustomResourceViewFilter(name)
                    return (
                      <button
                        key={filter}
                        type="button"
                        role="menuitemradio"
                        aria-checked={props.viewFilter === filter}
                        className={[
                          'tm-pm-gantt-view-option',
                          'tm-pm-gantt-view-option--nested',
                          props.viewFilter === filter ? 'tm-pm-gantt-view-option--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        title={name}
                        onMouseEnter={props.hideCustomViewSubmenu}
                        onClick={() => {
                          props.onViewFilterChange(filter)
                          props.setViewOpen(false)
                          props.setCustomViewSubPos(null)
                        }}
                        onContextMenu={(event) => {
                          if (!props.canEdit) return
                          event.preventDefault()
                          event.stopPropagation()
                          props.setViewOpen(false)
                          props.setCustomViewSubPos(null)
                          props.onRequestDeleteCustomTypeName(name)
                        }}
                      >
                        {name}
                      </button>
                    )
                  })
                : null}
              {props.customViewSubPos
                ? createPortal(
                    <div
                      className="tm-pm-gantt-resource-select-submenu tm-pm-resource-custom-submenu"
                      role="menu"
                      style={{
                        top: props.customViewSubPos.top,
                        left: props.customViewSubPos.left,
                      }}
                      onMouseEnter={props.keepCustomViewSubmenu}
                      onMouseLeave={props.scheduleHideCustomViewSubmenu}
                    >
                      <div className="tm-pm-resource-custom-submenu-compose">
                        <input
                          className="tm-pm-resource-custom-submenu-input"
                          value={props.customViewDraft}
                          placeholder={props.t(
                            'projectManagerPage.resourceTable.customTypeNamePlaceholder',
                          )}
                          autoFocus
                          onChange={(event) => props.setCustomViewDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              props.commitCustomViewTypeName(props.customViewDraft)
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault()
                              props.hideCustomViewSubmenu()
                            }
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <button
                          type="button"
                          className="tm-pm-resource-custom-submenu-apply"
                          disabled={!props.customViewDraft.trim()}
                          onClick={() => props.commitCustomViewTypeName(props.customViewDraft)}
                        >
                          {props.t('projectManagerPage.resourceTable.customTypeNameApply')}
                        </button>
                      </div>
                    </div>,
                    document.body,
                  )
                : null}
              <button
                type="button"
                role="menuitem"
                aria-disabled="true"
                title={props.t('projectManagerPage.resourceTable.views.costResourcesReserved')}
                className={[
                  'tm-pm-gantt-view-option',
                  'tm-pm-gantt-view-option--group',
                  'tm-pm-gantt-view-option--disabled',
                ].join(' ')}
                onMouseEnter={props.hideCustomViewSubmenu}
                onClick={(event) => event.preventDefault()}
              >
                <span>{props.t('projectManagerPage.resourceTable.views.costResources')}</span>
                <IconChevronDown size={14} className="tm-pm-gantt-view-option-chevron" />
              </button>
            </div>,
            document.body,
          )
        : null}
      <span className="tm-pm-resource-menubar-divider" />
    </span>
  )
}
