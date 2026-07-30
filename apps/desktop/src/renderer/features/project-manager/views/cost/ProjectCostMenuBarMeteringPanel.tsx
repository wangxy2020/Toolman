import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { useI18n } from '../../../../i18n/useI18n'
import { formatBaselineCaptureTime } from '../schedule/pm-gantt-baseline-compare'
import type { CostMenuAction, CostVersionSwitchEntry } from './ProjectCostMenuBar'
import type { MeteringBaseline, MeteringRollupMode } from './pm-metering-baselines'

export interface ProjectCostMenuBarMeteringPanelProps {
  pos: { top: number; left: number } | null
  versionSwitchEntries: CostVersionSwitchEntry[]
  onRestoreVersion: (version: number) => void
  meteringBaselines: readonly MeteringBaseline[]
  selectedMeteringBaselineId: string | null
  onSelectMeteringBaseline: (id: string) => void
  meteringRollupMode: MeteringRollupMode
  onMeteringRollupModeChange: (mode: MeteringRollupMode) => void
  onAction: (action: CostMenuAction) => void
  onClose: () => void
}

const METERING_ROLLUP_OPTIONS: ReadonlyArray<{
  mode: MeteringRollupMode
  labelKey: 'rollupNone' | 'rollupSection' | 'rollupCustom'
}> = [
  { mode: 'none', labelKey: 'rollupNone' },
  { mode: 'section', labelKey: 'rollupSection' },
  { mode: 'custom', labelKey: 'rollupCustom' },
]

/**
 * Dropdown for 价格表 · 计量 (same chrome as 甘特图 · 基线).
 * Hosts create/select period + price-list version switch (moved from「基准」).
 */
export const ProjectCostMenuBarMeteringPanel: FC<ProjectCostMenuBarMeteringPanelProps> = ({
  pos,
  versionSwitchEntries,
  onRestoreVersion,
  meteringBaselines,
  selectedMeteringBaselineId,
  onSelectMeteringBaseline,
  meteringRollupMode,
  onMeteringRollupModeChange,
  onAction,
  onClose,
}) => {
  const { t } = useI18n()
  if (!pos) return null

  return createPortal(
    <div
      className="tm-pm-gantt-view-panel tm-pm-gantt-type-panel"
      style={{ top: pos.top, left: pos.left }}
      role="menu"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="tm-pm-gantt-view-option"
        onClick={() => {
          onAction('meteringCaptureBaseline')
          onClose()
        }}
      >
        {t('projectManagerPage.costTable.meteringMenu.captureBaseline')}
      </button>

      <div className="tm-pm-gantt-submenu-title">
        {t('projectManagerPage.costTable.meteringMenu.rollupMode')}
      </div>
      {METERING_ROLLUP_OPTIONS.map(({ mode, labelKey }) => {
        const checked = meteringRollupMode === mode
        return (
          <button
            key={mode}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            className={[
              'tm-pm-gantt-view-option',
              checked ? 'tm-pm-gantt-view-option--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              onMeteringRollupModeChange(mode)
              onClose()
            }}
          >
            {t(`projectManagerPage.costTable.meteringMenu.${labelKey}`)}
          </button>
        )
      })}

      <div className="tm-pm-gantt-submenu-title">
        {t('projectManagerPage.costTable.meteringMenu.selectBaseline')}
      </div>
      {meteringBaselines.length === 0 ? (
        <div className="tm-pm-gantt-submenu-empty">
          {t('projectManagerPage.costTable.meteringMenu.selectBaselineEmpty')}
        </div>
      ) : (
        meteringBaselines.map((entry) => {
          const active = entry.id === selectedMeteringBaselineId
          const asOfLabel = entry.asOfDate.trim()
          const nameWithoutDate = entry.name
            .replace(/\s*[（(]\d{4}-\d{2}-\d{2}[）)]\s*$/u, '')
            .trim()
          const label =
            asOfLabel !== '' ? `${nameWithoutDate} (${asOfLabel})` : entry.name
          return (
            <button
              key={entry.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              className={[
                'tm-pm-gantt-view-option',
                'tm-pm-gantt-view-option--baseline',
                active ? 'tm-pm-gantt-view-option--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onSelectMeteringBaseline(entry.id)
                onClose()
              }}
            >
              <span className="tm-pm-gantt-baseline-option-name">{label}</span>
              <span className="tm-pm-gantt-baseline-option-time">
                {formatBaselineCaptureTime(entry.createdAt)}
              </span>
            </button>
          )
        })
      )}

      <div className="tm-pm-gantt-submenu-title">
        {t('projectManagerPage.costTable.meteringMenu.versionSwitch')}
      </div>
      {versionSwitchEntries.length === 0 ? (
        <div className="tm-pm-gantt-submenu-empty">
          {t('projectManagerPage.costTable.meteringMenu.versionSwitchEmpty')}
        </div>
      ) : (
        versionSwitchEntries.map((entry) => {
          const canSwitch = entry.hasSnapshot && !entry.isCurrent
          return (
            <button
              key={`restore-cost-v-${entry.version}`}
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
                onClose()
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

      <button
        type="button"
        role="menuitem"
        className="tm-pm-gantt-view-option"
        disabled={!selectedMeteringBaselineId}
        onClick={() => {
          onAction('meteringEditBaseline')
          onClose()
        }}
      >
        {t('projectManagerPage.costTable.meteringMenu.editBaseline')}
      </button>

      <button
        type="button"
        role="menuitem"
        className="tm-pm-gantt-view-option"
        disabled={!selectedMeteringBaselineId}
        onClick={() => {
          onAction('meteringDeleteBaseline')
          onClose()
        }}
      >
        {t('projectManagerPage.costTable.meteringMenu.deleteBaseline')}
      </button>
    </div>,
    document.body,
  )
}
