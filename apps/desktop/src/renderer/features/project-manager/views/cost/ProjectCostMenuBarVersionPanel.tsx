import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { useI18n } from '../../../../i18n/useI18n'
import type { CostVersionSwitchEntry } from './ProjectCostMenuBar'

export interface ProjectCostMenuBarVersionPanelProps {
  pos: { top: number; left: number } | null
  versionSwitchEntries: CostVersionSwitchEntry[]
  onRestoreVersion: (version: number) => void
}

/** Save-history / baseline version switch dropdown for the「基准」menu item. */
export const ProjectCostMenuBarVersionPanel: FC<ProjectCostMenuBarVersionPanelProps> = ({
  pos,
  versionSwitchEntries,
  onRestoreVersion,
}) => {
  const { t } = useI18n()
  if (!pos) return null
  return createPortal(
    <div className="tm-pm-gantt-view-panel" role="menu" style={{ top: pos.top, left: pos.left }}>
      <div className="tm-pm-gantt-submenu-title">
        {t('projectManagerPage.costTable.versionSwitch')}
      </div>
      {versionSwitchEntries.length === 0 ? (
        <div className="tm-pm-gantt-submenu-empty">
          {t('projectManagerPage.costTable.versionSwitchEmpty')}
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
                  : t('projectManagerPage.costTable.versionSwitchNoSnapshot')
              }
              onClick={() => {
                if (!canSwitch) return
                onRestoreVersion(entry.version)
              }}
            >
              {t('projectManagerPage.costTable.switchToVersion', {
                name: entry.name,
              })}
              {entry.isCurrent
                ? ` · ${t('projectManagerPage.projectInfo.saveHistoryCurrent')}`
                : ''}
              {!entry.hasSnapshot
                ? ` · ${t('projectManagerPage.costTable.versionSwitchNoSnapshotShort')}`
                : ''}
            </button>
          )
        })
      )}
    </div>,
    document.body,
  )
}
