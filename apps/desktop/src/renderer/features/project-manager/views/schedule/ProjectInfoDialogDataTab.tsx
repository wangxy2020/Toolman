import { useCallback, useEffect, useRef, useState, type FC } from 'react'

import {
  COST_DATABASE_VIEW_DEFAULT_TABLES,
  COST_DATABASE_VIEW_KEYS,
  columnsForCostDatabaseTable,
  fieldKeysForCostDatabaseView,
  defaultCostDatabasePort,
  matchCostDatabaseTableName,
  suggestCostDatabaseColumnMap,
  type CostDatabaseColumnMap,
  type CostDatabaseDriver,
  type CostDatabaseFieldKey,
  type CostDatabaseInspectSnapshot,
  type CostDatabaseViewKey,
  type PmCostDatabaseInspectInput,
} from '@toolman/shared'

import { pmApi } from '../../pm-api'
import { COST_DATABASE_FIELD_LABEL_KEYS } from '../cost/pm-cost-database-rows'
import type { ProjectInfoDialogState } from './useProjectInfoDialog'
import type { ProjectInfoDraft } from './pm-project-info-dialog-utils-types'

type Props = Pick<ProjectInfoDialogState, 't' | 'draft' | 'patchDraft' | 'persistCostDatabase'>

function draftToInspectInput(draft: ProjectInfoDraft): PmCostDatabaseInspectInput {
  const port = Number(draft.costDatabasePort)
  return {
    driver: draft.costDatabaseDriver,
    host: draft.costDatabaseHost.trim(),
    port: Number.isInteger(port) ? port : defaultCostDatabasePort(draft.costDatabaseDriver),
    user: draft.costDatabaseUser,
    password: draft.costDatabasePassword,
    database: draft.costDatabaseName.trim(),
    schema: draft.costDatabaseSchema.trim() || undefined,
  }
}

function uniqueFieldNames(...lists: Array<string | readonly string[] | undefined>): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const list of lists) {
    const items = typeof list === 'string' ? [list] : (list ?? [])
    for (const item of items) {
      const value = item.trim()
      if (!value) continue
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      names.push(value)
    }
  }
  return names
}

const VIEW_LABEL_KEYS: Record<CostDatabaseViewKey, string> = {
  constructionQuota: 'projectManagerPage.costDatabase.views.constructionQuota',
  budgetQuota: 'projectManagerPage.costDatabase.views.budgetQuota',
  estimateQuota: 'projectManagerPage.costDatabase.views.estimateQuota',
  estimateIndicator: 'projectManagerPage.costDatabase.views.estimateIndicator',
}

const DatabaseNameCombo: FC<{
  id: string
  value: string
  options: readonly string[]
  placeholder: string
  onChange: (value: string) => void
}> = ({ id, value, options, placeholder, onChange }) => {
  const selectValue = options.includes(value) ? value : ''
  return (
    <div className="tm-pm-project-info-db-combo">
      <input
        id={id}
        className="tm-kb-settings-input tm-pm-project-info-db-combo-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <select
        className="tm-pm-project-info-db-combo-select"
        aria-label={placeholder}
        tabIndex={-1}
        value={selectValue}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value)
        }}
      >
        <option value="" />
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}

function inspectMessage(
  t: Props['t'],
  snapshot: CostDatabaseInspectSnapshot,
): string {
  return t('projectManagerPage.projectInfo.dataInspectResult', {
    tables: String(snapshot.tableCount),
    columns: String(snapshot.columnCount),
    rows: String(snapshot.rowCount),
  })
}

export const ProjectInfoDialogDataTab: FC<Props> = ({ t, draft, patchDraft, persistCostDatabase }) => {
  const [tables, setTables] = useState<string[]>(() => draft.costDatabaseInspect?.tables ?? [])
  const [tableColumns, setTableColumns] = useState<Record<string, string[]>>(
    () => draft.costDatabaseInspect?.tableColumns ?? {},
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(() =>
    draft.costDatabaseInspect ? inspectMessage(t, draft.costDatabaseInspect) : null,
  )
  const persistTimerRef = useRef<number>(0)
  const persistCostDatabaseRef = useRef(persistCostDatabase)
  persistCostDatabaseRef.current = persistCostDatabase

  useEffect(() => {
    const snapshot = draft.costDatabaseInspect
    if (!snapshot) return
    setTables(snapshot.tables)
    setTableColumns(snapshot.tableColumns)
    setMessage(inspectMessage(t, snapshot))
  }, [draft.costDatabaseInspect, t])

  const persistDraft = useCallback((override: Partial<ProjectInfoDraft>, immediate = false) => {
    window.clearTimeout(persistTimerRef.current)
    const run = () => {
      void persistCostDatabaseRef.current(override)
    }
    if (immediate) {
      run()
      return
    }
    persistTimerRef.current = window.setTimeout(run, 400)
  }, [])

  useEffect(() => () => window.clearTimeout(persistTimerRef.current), [])

  const patchAndPersist = (patch: Partial<ProjectInfoDraft>) => {
    patchDraft(patch)
    persistDraft(patch)
  }

  const patchViewTable = (viewKey: CostDatabaseViewKey, tableName: string) => {
    const current = draft.costDatabaseViewTables[viewKey]
    const columns = columnsForCostDatabaseTable(tableColumns, tableName)
    const suggested: CostDatabaseColumnMap =
      columns.length > 0
        ? suggestCostDatabaseColumnMap(columns, fieldKeysForCostDatabaseView(viewKey))
        : {}
    const costDatabaseViewTables = {
      ...draft.costDatabaseViewTables,
      [viewKey]: {
        ...current,
        tableName,
        columnMap: {
          ...current.columnMap,
          ...Object.fromEntries(
            fieldKeysForCostDatabaseView(viewKey)
              .filter((key) => !current.columnMap[key] && suggested[key])
              .map((key) => [key, suggested[key]]),
          ),
        },
      },
    }
    patchDraft({ costDatabaseViewTables })
    persistDraft({ costDatabaseViewTables })
  }

  const patchViewColumn = (viewKey: CostDatabaseViewKey, key: CostDatabaseFieldKey, value: string) => {
    const current = draft.costDatabaseViewTables[viewKey]
    const costDatabaseViewTables = {
      ...draft.costDatabaseViewTables,
      [viewKey]: {
        ...current,
        columnMap: { ...current.columnMap, [key]: value },
      },
    }
    patchDraft({ costDatabaseViewTables })
    persistDraft({ costDatabaseViewTables })
  }

  const setDriver = (driver: CostDatabaseDriver) => {
    const currentPort = draft.costDatabasePort.trim()
    const previousDefault = String(defaultCostDatabasePort(draft.costDatabaseDriver))
    const nextDefault = String(defaultCostDatabasePort(driver))
    const patch = {
      costDatabaseDriver: driver,
      costDatabasePort: !currentPort || currentPort === previousDefault ? nextDefault : currentPort,
      costDatabaseUser:
        draft.costDatabaseUser.trim() === '' ||
        draft.costDatabaseUser === (draft.costDatabaseDriver === 'mysql' ? 'root' : 'postgres')
          ? driver === 'mysql'
            ? 'root'
            : 'postgres'
          : draft.costDatabaseUser,
      costDatabaseSchema:
        driver === 'postgres' && !draft.costDatabaseSchema.trim() ? 'public' : draft.costDatabaseSchema,
    }
    patchAndPersist(patch)
  }

  const inspect = useCallback(async () => {
    if (!draft.costDatabaseHost.trim() || !draft.costDatabaseName.trim()) {
      setMessage(t('projectManagerPage.projectInfo.dataNeedConnection'))
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await pmApi.inspectCostDatabase(draftToInspectInput(draft))
      setTables(result.tables)
      setTableColumns(result.tableColumns)
      const nextViewTables = { ...draft.costDatabaseViewTables }
      for (const viewKey of COST_DATABASE_VIEW_KEYS) {
        const preferred = nextViewTables[viewKey].tableName.trim()
        const matched = matchCostDatabaseTableName(result.tables, preferred)
        const tableName = result.tables.includes(matched) ? matched : preferred
        const columns = columnsForCostDatabaseTable(result.tableColumns, tableName)
        const suggested: CostDatabaseColumnMap =
          columns.length > 0
            ? suggestCostDatabaseColumnMap(columns, fieldKeysForCostDatabaseView(viewKey))
            : {}
        nextViewTables[viewKey] = {
          tableName,
          columnMap: {
            ...nextViewTables[viewKey].columnMap,
            ...Object.fromEntries(
              fieldKeysForCostDatabaseView(viewKey)
                .filter((key) => !nextViewTables[viewKey].columnMap[key] && suggested[key])
                .map((key) => [key, suggested[key]]),
            ),
          },
        }
      }
      const snapshot: CostDatabaseInspectSnapshot = {
        tables: result.tables,
        columns: result.columns,
        tableCount: result.tableCount,
        columnCount: result.columnCount,
        rowCount: result.rowCount,
        tableColumns: result.tableColumns,
      }
      patchDraft({ costDatabaseViewTables: nextViewTables, costDatabaseInspect: snapshot })
      persistDraft({ costDatabaseViewTables: nextViewTables, costDatabaseInspect: snapshot }, true)
      setMessage(inspectMessage(t, snapshot))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [draft, patchDraft, persistDraft, t])

  return (
    <div className="tm-kb-settings-form">
      <p className="tm-kb-settings-hint">{t('projectManagerPage.projectInfo.dataHint')}</p>
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label" htmlFor="pm-info-db-driver">
          {t('projectManagerPage.projectInfo.dataDriver')}
        </label>
        <select
          id="pm-info-db-driver"
          className="tm-kb-settings-input"
          value={draft.costDatabaseDriver}
          onChange={(event) => setDriver(event.target.value as CostDatabaseDriver)}
        >
          <option value="postgres">{t('projectManagerPage.projectInfo.dataDriverPostgres')}</option>
          <option value="mysql">{t('projectManagerPage.projectInfo.dataDriverMysql')}</option>
        </select>
      </div>
      <div className="tm-pm-project-info-db-grid">
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label" htmlFor="pm-info-db-host">
            {t('projectManagerPage.projectInfo.dataHost')}
          </label>
          <input
            id="pm-info-db-host"
            className="tm-kb-settings-input"
            value={draft.costDatabaseHost}
            onChange={(event) => patchAndPersist({ costDatabaseHost: event.target.value })}
            placeholder={t('projectManagerPage.projectInfo.dataHostPlaceholder')}
          />
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label" htmlFor="pm-info-db-port">
            {t('projectManagerPage.projectInfo.dataPort')}
          </label>
          <input
            id="pm-info-db-port"
            className="tm-kb-settings-input"
            value={draft.costDatabasePort}
            onChange={(event) => patchAndPersist({ costDatabasePort: event.target.value })}
            placeholder={String(defaultCostDatabasePort(draft.costDatabaseDriver))}
          />
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label" htmlFor="pm-info-db-user">
            {t('projectManagerPage.projectInfo.dataUser')}
          </label>
          <input
            id="pm-info-db-user"
            className="tm-kb-settings-input"
            value={draft.costDatabaseUser}
            onChange={(event) => patchAndPersist({ costDatabaseUser: event.target.value })}
            placeholder={draft.costDatabaseDriver === 'mysql' ? 'root' : 'postgres'}
          />
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label" htmlFor="pm-info-db-password">
            {t('projectManagerPage.projectInfo.dataPassword')}
          </label>
          <input
            id="pm-info-db-password"
            className="tm-kb-settings-input"
            type="password"
            value={draft.costDatabasePassword}
            onChange={(event) => patchAndPersist({ costDatabasePassword: event.target.value })}
          />
        </div>
      </div>
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label" htmlFor="pm-info-db-name">
          {t('projectManagerPage.projectInfo.dataName')}
        </label>
        <input
          id="pm-info-db-name"
          className="tm-kb-settings-input"
          value={draft.costDatabaseName}
          onChange={(event) => patchAndPersist({ costDatabaseName: event.target.value })}
          placeholder={t('projectManagerPage.projectInfo.dataNamePlaceholder')}
        />
      </div>
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label" htmlFor="pm-info-db-schema">
          {t('projectManagerPage.projectInfo.dataSchema')}
        </label>
        <input
          id="pm-info-db-schema"
          className="tm-kb-settings-input"
          value={draft.costDatabaseSchema}
          onChange={(event) => patchAndPersist({ costDatabaseSchema: event.target.value })}
          placeholder={t('projectManagerPage.projectInfo.dataSchemaPlaceholder')}
        />
      </div>
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label" htmlFor="pm-info-db-project-id">
          {t('projectManagerPage.projectInfo.dataProjectId')}
        </label>
        <input
          id="pm-info-db-project-id"
          className="tm-kb-settings-input"
          value={draft.costDatabaseProjectId}
          onChange={(event) => patchAndPersist({ costDatabaseProjectId: event.target.value })}
          placeholder={t('projectManagerPage.projectInfo.dataProjectIdPlaceholder')}
        />
      </div>
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label" htmlFor="pm-info-db-substation-lot">
          {t('projectManagerPage.projectInfo.dataSubstationLot')}
        </label>
        <input
          id="pm-info-db-substation-lot"
          className="tm-kb-settings-input"
          value={draft.costDatabaseSubstationLot}
          onChange={(event) => patchAndPersist({ costDatabaseSubstationLot: event.target.value })}
          placeholder={t('projectManagerPage.projectInfo.dataSubstationLotPlaceholder')}
        />
      </div>
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label" htmlFor="pm-info-db-schedule">
          {t('projectManagerPage.projectInfo.dataSchedule')}
        </label>
        <input
          id="pm-info-db-schedule"
          className="tm-kb-settings-input"
          value={draft.costDatabaseSchedule}
          onChange={(event) => patchAndPersist({ costDatabaseSchedule: event.target.value })}
          placeholder={t('projectManagerPage.projectInfo.dataSchedulePlaceholder')}
        />
      </div>
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label tm-kb-settings-label--with-hint" htmlFor="pm-info-db-currency">
          {t('projectManagerPage.projectInfo.dataCurrency')}
          <span
            className="tm-kb-settings-help tm-header-icon-tooltip-wrap tm-pm-project-info-db-help"
            data-tooltip={t('projectManagerPage.projectInfo.dataScheduleCurrencyHint')}
            aria-label={t('projectManagerPage.projectInfo.dataScheduleCurrencyHint')}
          >
            ⓘ
          </span>
        </label>
        <input
          id="pm-info-db-currency"
          className="tm-kb-settings-input"
          value={draft.costDatabaseCurrency}
          onChange={(event) => patchAndPersist({ costDatabaseCurrency: event.target.value })}
          placeholder={t('projectManagerPage.projectInfo.dataCurrencyPlaceholder')}
        />
      </div>
      <div className="tm-pm-project-info-db-inspect">
        <button
          type="button"
          className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
          disabled={busy}
          onClick={() => void inspect()}
        >
          {t('projectManagerPage.projectInfo.dataInspect')}
        </button>
        {message ? <p className="tm-pm-project-info-db-inspect-result">{message}</p> : null}
      </div>
      <div className="tm-pm-project-info-stats-group-title">
        {t('projectManagerPage.projectInfo.dataViewTableMap')}
      </div>
      {COST_DATABASE_VIEW_KEYS.map((viewKey) => {
        const binding = draft.costDatabaseViewTables[viewKey]
        const tableName = binding.tableName.trim()
        const columns = columnsForCostDatabaseTable(tableColumns, tableName)
        const tableOptions = uniqueFieldNames(
          tables,
          COST_DATABASE_VIEW_DEFAULT_TABLES[viewKey],
          binding.tableName,
        )
        return (
          <details key={viewKey} className="tm-pm-project-info-db-view">
            <summary>
              <span className="tm-kb-settings-label">{t(VIEW_LABEL_KEYS[viewKey])}</span>
              <span
                className="tm-kb-settings-input tm-pm-project-info-db-view-toggle"
                data-empty={tableName ? undefined : ''}
              >
                {tableName || t('projectManagerPage.projectInfo.dataViewTablePlaceholder')}
              </span>
            </summary>
            <div className="tm-pm-project-info-db-view-body">
              <div className="tm-kb-settings-row">
                <label className="tm-kb-settings-label" htmlFor={`pm-info-db-view-table-${viewKey}`}>
                  {t('projectManagerPage.projectInfo.dataViewTable')}
                </label>
                <DatabaseNameCombo
                  id={`pm-info-db-view-table-${viewKey}`}
                  value={binding.tableName}
                  options={tableOptions}
                  placeholder={t('projectManagerPage.projectInfo.dataViewTablePlaceholder')}
                  onChange={(value) => patchViewTable(viewKey, value)}
                />
              </div>
              <div className="tm-pm-project-info-db-view-columns">
                <div className="tm-pm-project-info-stats-group-title">
                  {t('projectManagerPage.projectInfo.dataColumnMap')}
                </div>
                {fieldKeysForCostDatabaseView(viewKey).map((key) => (
                  <div key={key} className="tm-kb-settings-row">
                    <label className="tm-kb-settings-label" htmlFor={`pm-info-db-col-${viewKey}-${key}`}>
                      {t(COST_DATABASE_FIELD_LABEL_KEYS[key])}
                    </label>
                    <DatabaseNameCombo
                      id={`pm-info-db-col-${viewKey}-${key}`}
                      value={binding.columnMap[key]}
                      options={uniqueFieldNames(columns, binding.columnMap[key])}
                      placeholder={t('projectManagerPage.projectInfo.dataColumnPlaceholder')}
                      onChange={(value) => patchViewColumn(viewKey, key, value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </details>
        )
      })}
    </div>
  )
}
