import type { Dispatch, RefObject, SetStateAction } from 'react'
import { createPortal } from 'react-dom'

import { IconChevronDown } from '../../../../components/icons'
import type { FeaturesVersionSwitchEntry } from './ProjectFeaturesMenuBarTypes'

type Props = {
  t: (key: string, params?: Record<string, string | number>) => string
  disabled: boolean
  hasProject: boolean
  baselineRef: RefObject<HTMLSpanElement | null>
  baselineOpen: boolean
  setBaselineOpen: Dispatch<SetStateAction<boolean>>
  baselinePos: { top: number; left: number } | null
  baselineMenuLabel: string
  versionSwitchEntries: FeaturesVersionSwitchEntry[]
  onRestoreVersion?: (version: number) => void
  hideTip: () => void
  tipProps: (text: string) => Record<string, unknown>
  closeSiblingMenus: () => void
}

export function ProjectFeaturesMenuBarVersionPanel({
  t,
  disabled,
  hasProject,
  baselineRef,
  baselineOpen,
  setBaselineOpen,
  baselinePos,
  baselineMenuLabel,
  versionSwitchEntries,
  onRestoreVersion,
  hideTip,
  tipProps,
  closeSiblingMenus,
}: Props) {
  return (
    <span className="tm-pm-features-menubar-item tm-pm-gantt-view-menu" ref={baselineRef}>
      <button
        type="button"
        className="tm-pm-features-menubar-btn"
        aria-label={baselineMenuLabel}
        aria-disabled={disabled || !hasProject}
        aria-expanded={baselineOpen}
        onClick={() => {
          if (disabled || !hasProject) return
          hideTip()
          closeSiblingMenus()
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
                {t('projectManagerPage.files.versionSwitch')}
              </div>
              {versionSwitchEntries.length === 0 ? (
                <div className="tm-pm-gantt-submenu-empty">
                  {t('projectManagerPage.files.versionSwitchEmpty')}
                </div>
              ) : (
                versionSwitchEntries.map((entry) => {
                  const canSwitch = entry.hasSnapshot && !entry.isCurrent
                  return (
                    <button
                      key={`restore-feature-v-${entry.version}`}
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
                          : t('projectManagerPage.files.versionSwitchNoSnapshot')
                      }
                      onClick={() => {
                        if (!canSwitch) return
                        onRestoreVersion?.(entry.version)
                        setBaselineOpen(false)
                      }}
                    >
                      {t('projectManagerPage.files.switchToVersion', {
                        name: entry.name,
                      })}
                      {entry.isCurrent
                        ? ` · ${t('projectManagerPage.projectInfo.saveHistoryCurrent')}`
                        : ''}
                      {!entry.hasSnapshot
                        ? ` · ${t('projectManagerPage.files.versionSwitchNoSnapshotShort')}`
                        : ''}
                    </button>
                  )
                })
              )}
            </div>,
            document.body,
          )
        : null}
      <span className="tm-pm-features-menubar-divider" />
    </span>
  )
}
