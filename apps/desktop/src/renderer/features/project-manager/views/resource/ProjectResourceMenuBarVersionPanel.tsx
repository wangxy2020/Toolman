import type { RefObject } from 'react'
import { createPortal } from 'react-dom'

import { IconChevronDown } from '../../../../components/icons'
import type { ResourceVersionSwitchEntry } from './ProjectResourceMenuBarTypes'

export function ProjectResourceMenuBarVersionPanel(props: {
  baselineRef: RefObject<HTMLSpanElement | null>
  baselinePos: { top: number; left: number } | null
  baselineOpen: boolean
  baselineMenuLabel: string
  versionSwitchEntries: ResourceVersionSwitchEntry[]
  disabled: boolean
  hasProject: boolean
  hideTip: () => void
  tipProps: (title: string) => Record<string, unknown>
  t: (key: string, vars?: Record<string, string>) => string
  setViewOpen: (open: boolean) => void
  setTypeOpen: (open: boolean) => void
  setBaselineOpen: (value: boolean | ((open: boolean) => boolean)) => void
  onRestoreVersion: (version: number) => void
}) {
  return (
    <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={props.baselineRef}>
      <button
        type="button"
        className="tm-pm-resource-menubar-btn"
        aria-label={props.baselineMenuLabel}
        aria-disabled={props.disabled || !props.hasProject}
        aria-expanded={props.baselineOpen}
        onClick={() => {
          if (props.disabled || !props.hasProject) return
          props.hideTip()
          props.setViewOpen(false)
          props.setTypeOpen(false)
          props.setBaselineOpen((open) => !open)
        }}
        {...props.tipProps(props.baselineMenuLabel)}
      >
        <span>{props.baselineMenuLabel}</span>
        <IconChevronDown size={14} />
      </button>
      {props.baselineOpen && props.baselinePos
        ? createPortal(
            <div
              className="tm-pm-gantt-view-panel"
              role="menu"
              style={{ top: props.baselinePos.top, left: props.baselinePos.left }}
            >
              <div className="tm-pm-gantt-submenu-title">
                {props.t('projectManagerPage.resourceTable.versionSwitch')}
              </div>
              {props.versionSwitchEntries.length === 0 ? (
                <div className="tm-pm-gantt-submenu-empty">
                  {props.t('projectManagerPage.resourceTable.versionSwitchEmpty')}
                </div>
              ) : (
                props.versionSwitchEntries.map((entry) => {
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
                          : props.t('projectManagerPage.resourceTable.versionSwitchNoSnapshot')
                      }
                      onClick={() => {
                        if (!canSwitch) return
                        props.onRestoreVersion(entry.version)
                        props.setBaselineOpen(false)
                      }}
                    >
                      {props.t('projectManagerPage.resourceTable.switchToVersion', {
                        name: entry.name,
                      })}
                      {entry.isCurrent
                        ? ` · ${props.t('projectManagerPage.projectInfo.saveHistoryCurrent')}`
                        : ''}
                      {!entry.hasSnapshot
                        ? ` · ${props.t('projectManagerPage.resourceTable.versionSwitchNoSnapshotShort')}`
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
  )
}
