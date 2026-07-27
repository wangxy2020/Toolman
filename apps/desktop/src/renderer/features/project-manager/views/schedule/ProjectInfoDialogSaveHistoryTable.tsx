import type { FC, ReactNode } from 'react'

import type { TranslateFn } from '../../../../i18n/I18nProvider'
import { formatDateTime } from './pm-project-info-dialog-utils'

export interface SaveHistoryColumn<T> {
  header: string
  render: (entry: T) => ReactNode
}

export interface SaveHistoryTableProps<T extends { version: number; savedAt: number }> {
  t: TranslateFn
  dateInputLang: string
  rows: T[]
  currentVersion: number
  deletingVersion: number | null
  onDelete: (entry: T) => void | Promise<void>
  /** Columns rendered between "Saved at" and "Actions" (e.g. resource count, duration). */
  columns: SaveHistoryColumn<T>[]
  /** Matches legacy `--resource` modifier reused by resource/cost/feature tables. */
  variant?: 'resource' | 'schedule'
  getRowKey?: (entry: T) => string
}

function ProjectInfoDialogSaveHistoryTableInner<T extends { version: number; savedAt: number }>({
  t,
  dateInputLang,
  rows,
  currentVersion,
  deletingVersion,
  onDelete,
  columns,
  variant = 'resource',
  getRowKey,
}: SaveHistoryTableProps<T>) {
  if (rows.length === 0) {
    return (
      <span className="tm-kb-settings-readonly">
        {t('projectManagerPage.projectInfo.saveHistoryEmpty')}
      </span>
    )
  }

  const className =
    variant === 'resource'
      ? 'tm-pm-project-info-save-history tm-pm-project-info-save-history--resource'
      : 'tm-pm-project-info-save-history'

  return (
    <div className={className} role="table">
      <div className="tm-pm-project-info-save-history-head" role="row">
        <span role="columnheader">{t('projectManagerPage.projectInfo.saveHistoryColVersion')}</span>
        <span role="columnheader">{t('projectManagerPage.projectInfo.saveHistoryColSavedAt')}</span>
        {columns.map((column) => (
          <span key={column.header} role="columnheader">
            {column.header}
          </span>
        ))}
        <span role="columnheader" className="tm-pm-project-info-save-history-actions">
          {t('projectManagerPage.projectInfo.saveHistoryColActions')}
        </span>
      </div>
      {rows.map((entry) => (
        <div
          key={getRowKey ? getRowKey(entry) : `${entry.version}-${entry.savedAt}`}
          className="tm-pm-project-info-save-history-row"
          role="row">
          <span role="cell">
            {t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(entry.version),
            })}
            {entry.version === currentVersion ? (
              <span className="tm-pm-project-info-save-history-current">
                {t('projectManagerPage.projectInfo.saveHistoryCurrent')}
              </span>
            ) : null}
          </span>
          <span role="cell">{formatDateTime(entry.savedAt, dateInputLang)}</span>
          {columns.map((column) => (
            <span key={column.header} role="cell">
              {column.render(entry)}
            </span>
          ))}
          <span role="cell" className="tm-pm-project-info-save-history-actions">
            <button
              type="button"
              className="tm-pm-project-info-save-history-delete"
              disabled={deletingVersion === entry.version}
              onClick={() => void onDelete(entry)}>
              {deletingVersion === entry.version ? '…' : t('common.delete')}
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}

// Cast keeps the component generic while satisfying the FC-based export convention used elsewhere.
export const ProjectInfoDialogSaveHistoryTable = ProjectInfoDialogSaveHistoryTableInner as <
  T extends { version: number; savedAt: number },
>(
  props: SaveHistoryTableProps<T>,
) => ReturnType<FC<SaveHistoryTableProps<T>>>
