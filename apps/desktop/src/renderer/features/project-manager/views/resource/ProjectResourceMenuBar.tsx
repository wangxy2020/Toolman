import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import {
  IconChevronDown,
  IconChevronUp,
  IconIndent,
  IconInsertRow,
  IconOutdent,
  IconPlus,
  IconPrint,
  IconProjectInfo,
  IconRedo,
  IconSave,
  IconSaveAsNewVersion,
  IconTrash,
  IconUndo,
} from '../../../../components/icons'
import { useMenuBarHScroll, useMenuBarTooltip } from '../../pm-menubar-chrome'
import {
  encodeCustomResourceViewFilter,
  parseCustomResourceViewFilter,
  PM_RESOURCE_BUILTIN_PRIMARY_TYPES,
  type PmResourceType,
} from './pm-resource-catalog'
import { useProjectResourceMenuBar } from './useProjectResourceMenuBar'

const ICON_SIZE = 16

/** `all` | built-in / custom enum | `customName:<name>` for a user-named type. */
export type ResourceViewFilter = 'all' | PmResourceType | string

export type ResourceMenuAction =
  | 'save'
  | 'saveAsNewVersion'
  | 'print'
  | 'projectInfo'
  | 'undo'
  | 'redo'
  | 'add'
  | 'insert'
  | 'delete'
  | 'indent'
  | 'outdent'
  | 'moveUp'
  | 'moveDown'

export type ResourceVersionSwitchEntry = {
  version: number
  name: string
  hasSnapshot: boolean
  isCurrent: boolean
}

type MenuItem = {
  key: ResourceMenuAction
  title: string
  label: ReactNode
  disabled?: boolean
  dividerAfter?: boolean
  icon?: boolean
}

export interface ProjectResourceMenuBarProps {
  disabled?: boolean
  hasSelection: boolean
  /** Enables 项目信息 — true for a concrete project or「全部项目」. */
  hasProject?: boolean
  canEdit?: boolean
  canUndo?: boolean
  canRedo?: boolean
  /** Table type filter; `all` shows every resource type. */
  viewFilter: ResourceViewFilter
  onViewFilterChange: (filter: ResourceViewFilter) => void
  /** Named custom types registered in View (and any still present on rows). */
  customTypeNames: readonly string[]
  /** Register a secondary custom type name from the View flyout. */
  onRegisterCustomTypeName: (name: string) => void
  /** Request deleting a named custom type (View nested list, context menu). */
  onRequestDeleteCustomTypeName: (name: string) => void
  selectedType: PmResourceType
  /** When selected row is custom, its user-defined type name. */
  selectedCustomTypeName?: string
  onTypeChange: (type: PmResourceType, customTypeName?: string) => void
  versionSwitchEntries: ResourceVersionSwitchEntry[]
  onRestoreVersion: (version: number) => void
  onAction: (action: ResourceMenuAction) => void
}

type Props = ProjectResourceMenuBarProps

export function ProjectResourceMenuBar({
  disabled = false,
  hasSelection,
  hasProject = false,
  canEdit = true,
  canUndo = false,
  canRedo = false,
  viewFilter,
  onViewFilterChange,
  customTypeNames,
  onRegisterCustomTypeName,
  onRequestDeleteCustomTypeName,
  selectedType,
  selectedCustomTypeName = '',
  onTypeChange,
  versionSwitchEntries,
  onRestoreVersion,
  onAction,
}: Props) {
  const {
    t,
    viewOpen,
    setViewOpen,
    typeOpen,
    setTypeOpen,
    baselineOpen,
    setBaselineOpen,
    customViewExpanded,
    setCustomViewExpanded,
    customViewSubPos,
    setCustomViewSubPos,
    customTypeSubPos,
    setCustomTypeSubPos,
    customViewDraft,
    setCustomViewDraft,
    viewRef,
    typeRef,
    baselineRef,
    customViewGroupRef,
    customTypeGroupRef,
    viewPos,
    typePos,
    baselinePos,
    keepCustomViewSubmenu,
    scheduleHideCustomViewSubmenu,
    hideCustomViewSubmenu,
    placeCustomSubmenu,
    viewMenuLabel,
    viewCurrentLabel,
    typeMenuLabel,
    typeLabel,
    baselineMenuLabel,
    closeTypeMenus,
    commitCustomViewTypeName,
    applyCustomTypeToSelection,
  } = useProjectResourceMenuBar({
    viewFilter,
    onViewFilterChange,
    onRegisterCustomTypeName,
    selectedType,
    selectedCustomTypeName,
    onTypeChange,
  })
  const { tooltip, hideTip, tipProps } = useMenuBarTooltip()
  const { scrollRef, trackRef, scrollMetrics, syncScrollMetrics, onTrackPointerDown } =
    useMenuBarHScroll()

  const items: MenuItem[] = [
    {
      key: 'save',
      title: t('projectManagerPage.resourceTable.menu.save'),
      label: <IconSave size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'saveAsNewVersion',
      title: t('projectManagerPage.resourceTable.menu.saveAsNewVersion'),
      label: <IconSaveAsNewVersion size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'print',
      title: t('projectManagerPage.resourceTable.menu.print'),
      label: <IconPrint size={ICON_SIZE} />,
      icon: true,
    },
    {
      key: 'projectInfo',
      title: t('projectManagerPage.resourceTable.menu.projectInfo'),
      label: <IconProjectInfo size={ICON_SIZE} />,
      icon: true,
      disabled: !hasProject,
    },
    {
      key: 'undo',
      title: t('projectManagerPage.resourceTable.menu.undo'),
      label: <IconUndo size={ICON_SIZE} />,
      icon: true,
      disabled: !canUndo,
    },
    {
      key: 'redo',
      title: t('projectManagerPage.resourceTable.menu.redo'),
      label: <IconRedo size={ICON_SIZE} />,
      icon: true,
      disabled: !canRedo,
      dividerAfter: true,
    },
    {
      key: 'add',
      title: t('projectManagerPage.resourceTable.menu.add'),
      label: <IconPlus size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'insert',
      title: t('projectManagerPage.resourceTable.menu.insert'),
      label: <IconInsertRow size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit || !hasSelection,
    },
    {
      key: 'delete',
      title: t('projectManagerPage.resourceTable.menu.delete'),
      label: <IconTrash size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'indent',
      title: t('projectManagerPage.resourceTable.menu.indent'),
      label: <IconIndent size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
    },
    {
      key: 'outdent',
      title: t('projectManagerPage.resourceTable.menu.outdent'),
      label: <IconOutdent size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
    },
    {
      key: 'moveUp',
      title: t('projectManagerPage.resourceTable.menu.moveUp'),
      label: <IconChevronUp size={ICON_SIZE} />,
      disabled: !hasSelection,
      icon: true,
    },
    {
      key: 'moveDown',
      title: t('projectManagerPage.resourceTable.menu.moveDown'),
      label: <IconChevronDown size={ICON_SIZE} />,
      disabled: !hasSelection,
      icon: true,
    },
  ]

  const leadingItems = items.slice(0, 8)
  const hierarchyItems = items.slice(8, 10)
  const moveItems = items.slice(10)

  const renderToolbarItem = (item: MenuItem) => {
    const isDisabled = Boolean(disabled || item.disabled)
    return (
      <span key={item.key} className="tm-pm-resource-menubar-item">
        <button
          type="button"
          className={[
            'tm-pm-resource-menubar-btn',
            item.icon ? 'tm-pm-resource-menubar-btn--icon' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={item.title}
          aria-disabled={isDisabled}
          onClick={() => {
            if (isDisabled) return
            hideTip()
            onAction(item.key)
          }}
          {...tipProps(item.title)}
        >
          {item.label}
        </button>
        {item.dividerAfter ? <span className="tm-pm-resource-menubar-divider" /> : null}
      </span>
    )
  }

  return (
    <div
      className={[
        'tm-pm-resource-menubar',
        scrollMetrics.overflowing ? 'tm-pm-resource-menubar--overflow' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="toolbar"
      aria-label={t('projectManagerPage.resourceTable.menu.barLabel')}
    >
      <div className="tm-pm-resource-menubar-main">
        <div
          ref={scrollRef}
          className="tm-pm-resource-menubar-scroll"
          onScroll={() => {
            hideTip()
            syncScrollMetrics()
          }}
        >
          <div className="tm-pm-resource-menubar-group">
            <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={viewRef}>
              <button
                type="button"
                className="tm-pm-resource-menubar-btn"
                aria-label={viewMenuLabel}
                aria-disabled={disabled}
                aria-expanded={viewOpen}
                onClick={() => {
                  if (disabled) return
                  hideTip()
                  setTypeOpen(false)
                  setBaselineOpen(false)
                  setViewOpen((open) => {
                    const next = !open
                    if (next) {
                      setCustomViewExpanded(
                        customTypeNames.length > 0 ||
                          viewFilter === 'custom' ||
                          parseCustomResourceViewFilter(viewFilter) != null,
                      )
                    }
                    return next
                  })
                }}
                {...tipProps(viewMenuLabel)}
              >
                <span>{viewMenuLabel}</span>
                <span className="tm-pm-gantt-view-current">{viewCurrentLabel}</span>
                <IconChevronDown size={14} />
              </button>
              {viewOpen && viewPos
                ? createPortal(
                    <div
                      className="tm-pm-gantt-view-panel tm-pm-resource-view-panel"
                      role="menu"
                      style={{ top: viewPos.top, left: viewPos.left }}
                    >
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={viewFilter === 'all'}
                        className={[
                          'tm-pm-gantt-view-option',
                          viewFilter === 'all' ? 'tm-pm-gantt-view-option--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onMouseEnter={hideCustomViewSubmenu}
                        onClick={() => {
                          onViewFilterChange('all')
                          setViewOpen(false)
                        }}
                      >
                        {t('projectManagerPage.resourceTable.views.allTypes')}
                      </button>
                      {PM_RESOURCE_BUILTIN_PRIMARY_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          role="menuitemradio"
                          aria-checked={viewFilter === type}
                          className={[
                            'tm-pm-gantt-view-option',
                            viewFilter === type ? 'tm-pm-gantt-view-option--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onMouseEnter={hideCustomViewSubmenu}
                          onClick={() => {
                            onViewFilterChange(type)
                            setViewOpen(false)
                          }}
                        >
                          {t(`projectManagerPage.resourceTable.types.${type}`)}
                        </button>
                      ))}
                      <div
                        ref={customViewGroupRef}
                        className={[
                          'tm-pm-gantt-view-option',
                          'tm-pm-gantt-view-option--group',
                          'tm-pm-resource-type-cell-custom-row',
                          viewFilter === 'custom' ? 'tm-pm-gantt-view-option--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        role="none"
                        onMouseEnter={(event) => {
                          keepCustomViewSubmenu()
                          setCustomViewSubPos(
                            placeCustomSubmenu(event.currentTarget, { height: 56 }),
                          )
                        }}
                        onMouseLeave={scheduleHideCustomViewSubmenu}
                      >
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={viewFilter === 'custom'}
                          className="tm-pm-resource-type-cell-custom-main"
                          onClick={() => {
                            onViewFilterChange('custom')
                            const anchor = customViewGroupRef.current
                            if (anchor) {
                              keepCustomViewSubmenu()
                              setCustomViewSubPos(placeCustomSubmenu(anchor, { height: 56 }))
                            }
                            if (customTypeNames.length > 0) setCustomViewExpanded(true)
                          }}
                        >
                          {t('projectManagerPage.resourceTable.types.custom')}
                        </button>
                        {customTypeNames.length > 0 ? (
                          <button
                            type="button"
                            className="tm-pm-resource-type-cell-fold"
                            aria-expanded={customViewExpanded}
                            aria-label={t('projectManagerPage.resourceTable.types.custom')}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              setCustomViewExpanded((open) => !open)
                            }}
                          >
                            <IconChevronDown
                              size={14}
                              className={[
                                'tm-pm-gantt-view-option-chevron',
                                customViewExpanded
                                  ? 'tm-pm-gantt-view-option-chevron--open'
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            />
                          </button>
                        ) : null}
                      </div>
                      {customViewExpanded
                        ? customTypeNames.map((name) => {
                            const filter = encodeCustomResourceViewFilter(name)
                            return (
                              <button
                                key={filter}
                                type="button"
                                role="menuitemradio"
                                aria-checked={viewFilter === filter}
                                className={[
                                  'tm-pm-gantt-view-option',
                                  'tm-pm-gantt-view-option--nested',
                                  viewFilter === filter ? 'tm-pm-gantt-view-option--active' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                title={name}
                                onMouseEnter={hideCustomViewSubmenu}
                                onClick={() => {
                                  onViewFilterChange(filter)
                                  setViewOpen(false)
                                  setCustomViewSubPos(null)
                                }}
                                onContextMenu={(event) => {
                                  if (!canEdit) return
                                  event.preventDefault()
                                  event.stopPropagation()
                                  setViewOpen(false)
                                  setCustomViewSubPos(null)
                                  onRequestDeleteCustomTypeName(name)
                                }}
                              >
                                {name}
                              </button>
                            )
                          })
                        : null}
                      {customViewSubPos
                        ? createPortal(
                            <div
                              className="tm-pm-gantt-resource-select-submenu tm-pm-resource-custom-submenu"
                              role="menu"
                              style={{ top: customViewSubPos.top, left: customViewSubPos.left }}
                              onMouseEnter={keepCustomViewSubmenu}
                              onMouseLeave={scheduleHideCustomViewSubmenu}
                            >
                              <div className="tm-pm-resource-custom-submenu-compose">
                                <input
                                  className="tm-pm-resource-custom-submenu-input"
                                  value={customViewDraft}
                                  placeholder={t(
                                    'projectManagerPage.resourceTable.customTypeNamePlaceholder',
                                  )}
                                  autoFocus
                                  onChange={(event) => setCustomViewDraft(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      commitCustomViewTypeName(customViewDraft)
                                    }
                                    if (event.key === 'Escape') {
                                      event.preventDefault()
                                      hideCustomViewSubmenu()
                                    }
                                  }}
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <button
                                  type="button"
                                  className="tm-pm-resource-custom-submenu-apply"
                                  disabled={!customViewDraft.trim()}
                                  onClick={() => commitCustomViewTypeName(customViewDraft)}
                                >
                                  {t('projectManagerPage.resourceTable.customTypeNameApply')}
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
                        title={t('projectManagerPage.resourceTable.views.costResourcesReserved')}
                        className={[
                          'tm-pm-gantt-view-option',
                          'tm-pm-gantt-view-option--group',
                          'tm-pm-gantt-view-option--disabled',
                        ].join(' ')}
                        onMouseEnter={hideCustomViewSubmenu}
                        onClick={(event) => event.preventDefault()}
                      >
                        <span>{t('projectManagerPage.resourceTable.views.costResources')}</span>
                        <IconChevronDown
                          size={14}
                          className="tm-pm-gantt-view-option-chevron"
                        />
                      </button>
                    </div>,
                    document.body,
                  )
                : null}
              <span className="tm-pm-resource-menubar-divider" />
            </span>

            {leadingItems.map(renderToolbarItem)}
            {hierarchyItems.map(renderToolbarItem)}

            <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={typeRef}>
              <button
                type="button"
                className="tm-pm-resource-menubar-btn"
                aria-label={typeMenuLabel}
                aria-disabled={disabled || !hasSelection}
                aria-expanded={typeOpen}
                onClick={() => {
                  if (disabled || !hasSelection) return
                  hideTip()
                  setViewOpen(false)
                  setBaselineOpen(false)
                  setTypeOpen((open) => !open)
                }}
                {...tipProps(typeMenuLabel)}
              >
                <span>{typeMenuLabel}</span>
                <span className="tm-pm-gantt-view-current">{typeLabel}</span>
                <IconChevronDown size={14} />
              </button>
              {typeOpen && typePos
                ? createPortal(
                    <div
                      className="tm-pm-gantt-view-panel tm-pm-gantt-type-panel"
                      role="menu"
                      style={{ top: typePos.top, left: typePos.left }}
                    >
                      {PM_RESOURCE_BUILTIN_PRIMARY_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selectedType === type}
                          className={[
                            'tm-pm-gantt-view-option',
                            selectedType === type ? 'tm-pm-gantt-view-option--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            onTypeChange(type)
                            setTypeOpen(false)
                            setCustomTypeSubPos(null)
                          }}
                        >
                          {t(`projectManagerPage.resourceTable.types.${type}`)}
                        </button>
                      ))}
                      <button
                        ref={customTypeGroupRef}
                        type="button"
                        role="menuitem"
                        aria-haspopup="menu"
                        aria-expanded={customTypeSubPos != null}
                        aria-checked={selectedType === 'custom'}
                        className={[
                          'tm-pm-gantt-view-option',
                          'tm-pm-gantt-view-option--group',
                          selectedType === 'custom' ? 'tm-pm-gantt-view-option--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onMouseEnter={(event) => {
                          setCustomTypeSubPos(placeCustomSubmenu(event.currentTarget))
                        }}
                        onClick={(event) => {
                          setCustomTypeSubPos(placeCustomSubmenu(event.currentTarget))
                          onTypeChange('custom', selectedCustomTypeName)
                        }}
                      >
                        <span>{t('projectManagerPage.resourceTable.types.custom')}</span>
                        <IconChevronDown
                          size={14}
                          className={[
                            'tm-pm-gantt-view-option-chevron',
                            customTypeSubPos ? 'tm-pm-gantt-view-option-chevron--open' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        />
                      </button>
                      {customTypeSubPos
                        ? createPortal(
                            <div
                              className="tm-pm-gantt-resource-select-submenu tm-pm-resource-custom-submenu"
                              role="menu"
                              style={{ top: customTypeSubPos.top, left: customTypeSubPos.left }}
                            >
                              <div className="tm-pm-resource-custom-submenu-list">
                                <button
                                  type="button"
                                  role="menuitemradio"
                                  aria-checked={
                                    selectedType === 'custom' && !selectedCustomTypeName.trim()
                                  }
                                  className={[
                                    'tm-pm-resource-custom-submenu-item',
                                    selectedType === 'custom' && !selectedCustomTypeName.trim()
                                      ? 'tm-pm-resource-custom-submenu-item--active'
                                      : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  onClick={() => {
                                    onTypeChange('custom', '')
                                    closeTypeMenus()
                                  }}
                                >
                                  {t('projectManagerPage.resourceTable.types.custom')}
                                </button>
                                {customTypeNames.map((name) => (
                                  <button
                                    key={`type-custom:${name}`}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={
                                      selectedType === 'custom' &&
                                      selectedCustomTypeName.trim() === name
                                    }
                                    className={[
                                      'tm-pm-resource-custom-submenu-item',
                                      selectedType === 'custom' &&
                                      selectedCustomTypeName.trim() === name
                                        ? 'tm-pm-resource-custom-submenu-item--active'
                                        : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    title={name}
                                    onClick={() => applyCustomTypeToSelection(name)}
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
                        title={t('projectManagerPage.resourceTable.views.costResourcesReserved')}
                        className={[
                          'tm-pm-gantt-view-option',
                          'tm-pm-gantt-view-option--group',
                          'tm-pm-gantt-view-option--disabled',
                        ].join(' ')}
                        onClick={(event) => event.preventDefault()}
                      >
                        <span>{t('projectManagerPage.resourceTable.views.costResources')}</span>
                        <IconChevronDown
                          size={14}
                          className="tm-pm-gantt-view-option-chevron"
                        />
                      </button>
                    </div>,
                    document.body,
                  )
                : null}
              <span className="tm-pm-resource-menubar-divider" />
            </span>

            {moveItems.map(renderToolbarItem)}

            <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={baselineRef}>
              <button
                type="button"
                className="tm-pm-resource-menubar-btn"
                aria-label={baselineMenuLabel}
                aria-disabled={disabled || !hasProject}
                aria-expanded={baselineOpen}
                onClick={() => {
                  if (disabled || !hasProject) return
                  hideTip()
                  setViewOpen(false)
                  setTypeOpen(false)
                  setBaselineOpen((open) => !open)
                }}
                {...tipProps(baselineMenuLabel)}
              >
                <span>{baselineMenuLabel}</span>
                <IconChevronDown size={14} />
              </button>
              {baselineOpen && baselinePos
                ? createPortal(
                    <div
                      className="tm-pm-gantt-view-panel"
                      role="menu"
                      style={{ top: baselinePos.top, left: baselinePos.left }}
                    >
                      <div className="tm-pm-gantt-submenu-title">
                        {t('projectManagerPage.resourceTable.versionSwitch')}
                      </div>
                      {versionSwitchEntries.length === 0 ? (
                        <div className="tm-pm-gantt-submenu-empty">
                          {t('projectManagerPage.resourceTable.versionSwitchEmpty')}
                        </div>
                      ) : (
                        versionSwitchEntries.map((entry) => {
                          const canSwitch = entry.hasSnapshot && !entry.isCurrent
                          return (
                            <button
                              key={`restore-resource-v-${entry.version}`}
                              type="button"
                              role="menuitem"
                              className={[
                                'tm-pm-gantt-view-option',
                                entry.isCurrent ? 'tm-pm-gantt-view-option--active' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              disabled={!entry.hasSnapshot || entry.isCurrent}
                              title={
                                entry.hasSnapshot
                                  ? undefined
                                  : t('projectManagerPage.resourceTable.versionSwitchNoSnapshot')
                              }
                              onClick={() => {
                                if (!canSwitch) return
                                onRestoreVersion(entry.version)
                                setBaselineOpen(false)
                              }}
                            >
                              {t('projectManagerPage.resourceTable.switchToVersion', {
                                name: entry.name,
                              })}
                              {entry.isCurrent
                                ? ` · ${t('projectManagerPage.projectInfo.saveHistoryCurrent')}`
                                : ''}
                              {!entry.hasSnapshot
                                ? ` · ${t('projectManagerPage.resourceTable.versionSwitchNoSnapshotShort')}`
                                : ''}
                            </button>
                          )
                        })
                      )}
                    </div>,
                    document.body,
                  )
                : null}
            </span>
          </div>
        </div>
        {scrollMetrics.overflowing ? (
          <div
            ref={trackRef}
            className="tm-pm-resource-menubar-hscroll"
            onPointerDown={onTrackPointerDown}
          >
            <div
              className="tm-pm-resource-menubar-hscroll-thumb"
              style={{
                width: `${scrollMetrics.thumbSize * 100}%`,
                left: `${scrollMetrics.thumbOffset * 100}%`,
              }}
            />
          </div>
        ) : null}
      </div>
      {tooltip
        ? createPortal(
            <div
              className="tm-pm-resource-menubar-tooltip"
              role="tooltip"
              style={{ top: tooltip.top, left: tooltip.left }}
            >
              {tooltip.text}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
