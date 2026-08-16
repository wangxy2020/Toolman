import type { RefObject } from 'react'
import { createPortal } from 'react-dom'

import { IconChevronDown } from '../../../../components/icons'
import { PM_RESOURCE_BUILTIN_PRIMARY_TYPES, type PmResourceType } from './pm-resource-catalog'

export function ProjectResourceMenuBarTypePanel(props: {
  typeRef: RefObject<HTMLSpanElement | null>
  typePos: { top: number; left: number } | null
  customTypeGroupRef: RefObject<HTMLButtonElement | null>
  typeOpen: boolean
  typeMenuLabel: string
  typeLabel: string
  selectedType: PmResourceType
  selectedCustomTypeName: string
  customTypeNames: readonly string[]
  customTypeSubPos: { top: number; left: number } | null
  disabled: boolean
  hasSelection: boolean
  hideTip: () => void
  tipProps: (title: string) => Record<string, unknown>
  t: (key: string) => string
  setViewOpen: (open: boolean) => void
  setBaselineOpen: (open: boolean) => void
  setTypeOpen: (value: boolean | ((open: boolean) => boolean)) => void
  setCustomTypeSubPos: (pos: { top: number; left: number } | null) => void
  onTypeChange: (type: PmResourceType, customTypeName?: string) => void
  placeCustomSubmenu: (el: HTMLElement) => { top: number; left: number }
  closeTypeMenus: () => void
  applyCustomTypeToSelection: (name: string) => void
}) {
  return (
    <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={props.typeRef}>
      <button
        type="button"
        className="tm-pm-resource-menubar-btn"
        aria-label={props.typeMenuLabel}
        aria-disabled={props.disabled || !props.hasSelection}
        aria-expanded={props.typeOpen}
        onClick={() => {
          if (props.disabled || !props.hasSelection) return
          props.hideTip()
          props.setViewOpen(false)
          props.setBaselineOpen(false)
          props.setTypeOpen((open) => !open)
        }}
        {...props.tipProps(props.typeMenuLabel)}
      >
        <span>{props.typeMenuLabel}</span>
        <span className="tm-pm-gantt-view-current">{props.typeLabel}</span>
        <IconChevronDown size={14} />
      </button>
      {props.typeOpen && props.typePos
        ? createPortal(
            <div
              className="tm-pm-gantt-view-panel tm-pm-gantt-type-panel"
              role="menu"
              style={{ top: props.typePos.top, left: props.typePos.left }}
            >
              {PM_RESOURCE_BUILTIN_PRIMARY_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="menuitemradio"
                  aria-checked={props.selectedType === type}
                  className={[
                    'tm-pm-gantt-view-option',
                    props.selectedType === type ? 'tm-pm-gantt-view-option--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    props.onTypeChange(type)
                    props.setTypeOpen(false)
                    props.setCustomTypeSubPos(null)
                  }}
                >
                  {props.t(`projectManagerPage.resourceTable.types.${type}`)}
                </button>
              ))}
              <button
                ref={props.customTypeGroupRef}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={props.customTypeSubPos != null}
                aria-checked={props.selectedType === 'custom'}
                className={[
                  'tm-pm-gantt-view-option',
                  'tm-pm-gantt-view-option--group',
                  props.selectedType === 'custom' ? 'tm-pm-gantt-view-option--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={(event) => {
                  props.setCustomTypeSubPos(props.placeCustomSubmenu(event.currentTarget))
                }}
                onClick={(event) => {
                  props.setCustomTypeSubPos(props.placeCustomSubmenu(event.currentTarget))
                  props.onTypeChange('custom', props.selectedCustomTypeName)
                }}
              >
                <span>{props.t('projectManagerPage.resourceTable.types.custom')}</span>
                <IconChevronDown
                  size={14}
                  className={[
                    'tm-pm-gantt-view-option-chevron',
                    props.customTypeSubPos ? 'tm-pm-gantt-view-option-chevron--open' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              </button>
              {props.customTypeSubPos
                ? createPortal(
                    <div
                      className="tm-pm-gantt-resource-select-submenu tm-pm-resource-custom-submenu"
                      role="menu"
                      style={{
                        top: props.customTypeSubPos.top,
                        left: props.customTypeSubPos.left,
                      }}
                    >
                      <div className="tm-pm-resource-custom-submenu-list">
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={
                            props.selectedType === 'custom' && !props.selectedCustomTypeName.trim()
                          }
                          className={[
                            'tm-pm-resource-custom-submenu-item',
                            props.selectedType === 'custom' && !props.selectedCustomTypeName.trim()
                              ? 'tm-pm-resource-custom-submenu-item--active'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            props.onTypeChange('custom', '')
                            props.closeTypeMenus()
                          }}
                        >
                          {props.t('projectManagerPage.resourceTable.types.custom')}
                        </button>
                        {props.customTypeNames.map((name) => (
                          <button
                            key={`type-custom:${name}`}
                            type="button"
                            role="menuitemradio"
                            aria-checked={
                              props.selectedType === 'custom' &&
                              props.selectedCustomTypeName.trim() === name
                            }
                            className={[
                              'tm-pm-resource-custom-submenu-item',
                              props.selectedType === 'custom' &&
                              props.selectedCustomTypeName.trim() === name
                                ? 'tm-pm-resource-custom-submenu-item--active'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            title={name}
                            onClick={() => props.applyCustomTypeToSelection(name)}
                          >
                            {name}
                          </button>
                        ))}
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
