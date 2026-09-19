import type { FC } from 'react'

import { IconCheck } from '../../../../components/icons'
import {
  ALL_DATABASE_ROW_FILTER,
  isDatabaseRowFilterAll,
  toggleDatabaseRowFilterValue,
  type DatabaseRowFilter,
} from './pm-cost-row-filter'

export interface ProjectCostRowFilterOptionsProps {
  t: (key: string, params?: Record<string, string | number>) => string
  filter: DatabaseRowFilter
  subprojectOptions: readonly string[]
  sectionalOptions: readonly string[]
  onChange: (filter: DatabaseRowFilter) => void
}

function optionLabel(value: string, uncategorized: string): string {
  return value || uncategorized
}

function FilterOptionButton({
  label,
  checked,
  onToggle,
}: {
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      className={[
        'tm-pm-gantt-view-option',
        'tm-pm-gantt-view-option--checkable',
        checked ? 'tm-pm-gantt-view-option--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onToggle}
    >
      <span className="tm-pm-gantt-view-option-label">{label}</span>
      <span className="tm-pm-gantt-view-option-check" aria-hidden="true">
        {checked ? <IconCheck size={14} /> : null}
      </span>
    </button>
  )
}

/** Checkbox list: 全部 + 子项目 + 分部工程. Stays open so multiple conditions can be set. */
export const ProjectCostRowFilterOptions: FC<ProjectCostRowFilterOptionsProps> = ({
  t,
  filter,
  subprojectOptions,
  sectionalOptions,
  onChange,
}) => {
  const uncategorized = t('projectManagerPage.costTable.columns.filterUncategorized')
  const allActive = isDatabaseRowFilterAll(filter)

  return (
    <>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={allActive}
        className={[
          'tm-pm-gantt-view-option',
          allActive ? 'tm-pm-gantt-view-option--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onChange(ALL_DATABASE_ROW_FILTER)}
      >
        {t('projectManagerPage.costTable.columns.filterAll')}
      </button>
      <div className="tm-pm-gantt-submenu-title">
        {t('projectManagerPage.costTable.columns.subproject')}
      </div>
      {subprojectOptions.length === 0 ? (
        <div className="tm-pm-gantt-submenu-empty">—</div>
      ) : (
        subprojectOptions.map((value) => (
          <FilterOptionButton
            key={`filter-subproject:${value || '__empty__'}`}
            label={optionLabel(value, uncategorized)}
            checked={filter.subprojects.includes(value)}
            onToggle={() => onChange(toggleDatabaseRowFilterValue(filter, 'subprojects', value))}
          />
        ))
      )}
      <div className="tm-pm-gantt-submenu-title">
        {t('projectManagerPage.costTable.columns.sectionalWork')}
      </div>
      {sectionalOptions.length === 0 ? (
        <div className="tm-pm-gantt-submenu-empty">—</div>
      ) : (
        sectionalOptions.map((value) => (
          <FilterOptionButton
            key={`filter-sectional:${value || '__empty__'}`}
            label={optionLabel(value, uncategorized)}
            checked={filter.sectionalWorks.includes(value)}
            onToggle={() => onChange(toggleDatabaseRowFilterValue(filter, 'sectionalWorks', value))}
          />
        ))
      )}
    </>
  )
}
