import { describe, expect, it } from 'vitest'

import {
  COST_DATABASE_META_KEY,
  COST_DATABASE_VIEW_DEFAULT_TABLES,
  buildCostDatabaseMetadata,
  columnsForCostDatabaseTable,
  compactCostDatabaseViewTables,
  emptyCostDatabaseColumnMap,
  emptyCostDatabaseViewTables,
  isAllowedLocalDatabaseHost,
  isCostDatabaseConnectionReady,
  listCostDatabaseIdentifierColumns,
  matchCostDatabaseTableName,
  resolveCostDatabaseProjectFilterColumns,
  lookupCostDatabaseScheduleCurrency,
  pairCostDatabaseScheduleCurrencies,
  parseCostDatabaseCsvList,
  parseCostDatabaseNumber,
  readCostDatabaseConnection,
  resolveCostDatabaseColumnMap,
  resolveCostDatabaseViewBinding,
  resolveAliasColumn,
  resolveProjectIdColumn,
  suggestCostDatabaseColumnMap,
  fieldKeysForCostDatabaseView,
  COST_DATABASE_METERING_VIEW_FIELD_KEYS,
  COST_DATABASE_PROGRESS_PAYMENT_VIEW_FIELD_KEYS,
  COST_DATABASE_CURRENCY_ALIASES,
  COST_DATABASE_SCHEDULE_ALIASES,
  COST_DATABASE_SUBSTATION_LOT_ALIASES,
} from './pm-cost-database.js'

const readyConnection = {
  driver: 'postgres' as const,
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'cost',
  schema: 'public',
  projectId: 'PRJ-01',
  substationLot: '',
  schedule: '',
  currency: '',
  tableName: '清单',
  columnMap: {},
  viewTables: {},
}

describe('pm-cost-database', () => {
  it('is ready only when host, database and project id are set', () => {
    expect(isCostDatabaseConnectionReady(null)).toBe(false)
    expect(
      isCostDatabaseConnectionReady({
        ...readyConnection,
        database: '  ',
      }),
    ).toBe(false)
    expect(
      isCostDatabaseConnectionReady({
        ...readyConnection,
        projectId: '',
      }),
    ).toBe(false)
    expect(isCostDatabaseConnectionReady(readyConnection)).toBe(true)
  })

  it('only allows localhost or private-network hosts', () => {
    expect(isAllowedLocalDatabaseHost('localhost')).toBe(true)
    expect(isAllowedLocalDatabaseHost('127.0.0.1')).toBe(true)
    expect(isAllowedLocalDatabaseHost('192.168.1.8')).toBe(true)
    expect(isAllowedLocalDatabaseHost('10.0.0.2')).toBe(true)
    expect(isAllowedLocalDatabaseHost('172.16.0.4')).toBe(true)
    expect(isAllowedLocalDatabaseHost('db.internal.local')).toBe(true)
    expect(isAllowedLocalDatabaseHost('8.8.8.8')).toBe(false)
    expect(isAllowedLocalDatabaseHost('example.com')).toBe(false)
  })

  it('round-trips metadata and drops empty column mappings', () => {
    const metadata = buildCostDatabaseMetadata({
      driver: 'mysql',
      host: ' localhost ',
      port: '3306',
      user: ' root ',
      password: 'secret',
      database: ' 定额 ',
      schema: '',
      projectId: ' PRJ-01 ',
      substationLot: ' Lot-A ',
      schedule: ' 土建 ',
      currency: ' CNY ',
      tableName: ' 清单 ',
      columnMap: { ...emptyCostDatabaseColumnMap(), code: '编码', name: '  ' },
      viewTables: {
        ...emptyCostDatabaseViewTables(),
        constructionQuota: {
          tableName: ' 清单 ',
          columnMap: { ...emptyCostDatabaseColumnMap(), code: '编码', name: '  ' },
        },
      },
    })
    expect(metadata[COST_DATABASE_META_KEY]).toEqual({
      driver: 'mysql',
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'secret',
      database: '定额',
      schema: '',
      projectId: 'PRJ-01',
      substationLot: 'Lot-A',
      schedule: '土建',
      currency: 'CNY',
      tableName: '清单',
      columnMap: { code: '编码' },
      viewTables: {
        constructionQuota: { tableName: '清单', columnMap: { code: '编码' } },
        budgetQuota: { tableName: 'ipc_detail', columnMap: {} },
        estimateQuota: { tableName: 'ipc_master', columnMap: {} },
        estimateIndicator: { tableName: 'project_master', columnMap: {} },
      },
    })
    expect(readCostDatabaseConnection(metadata)?.columnMap).toEqual({ code: '编码' })
    expect(readCostDatabaseConnection(metadata)?.viewTables.budgetQuota?.tableName).toBe('ipc_detail')
  })

  it('persists inspect results and auto-mapped columns', () => {
    const viewTables = emptyCostDatabaseViewTables()
    viewTables.constructionQuota.columnMap.code = 'item_code'
    const metadata = buildCostDatabaseMetadata({
      driver: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      user: 'postgres',
      password: '',
      database: 'cost',
      schema: 'public',
      projectId: 'PRJ-01',
      substationLot: '',
      schedule: '',
      currency: '',
      viewTables,
      inspect: {
        tables: ['public.boq_detail'],
        columns: ['item_code', 'item_name'],
        tableCount: 1,
        columnCount: 2,
        rowCount: 8,
        tableColumns: { 'public.boq_detail': ['item_code', 'item_name'] },
      },
    })
    const connection = readCostDatabaseConnection(metadata)
    expect(connection?.inspect?.tableCount).toBe(1)
    expect(connection?.inspect?.tableColumns['public.boq_detail']).toEqual(['item_code', 'item_name'])
    expect(connection?.viewTables.constructionQuota).toEqual({
      tableName: 'boq_detail',
      columnMap: { code: 'item_code' },
    })
  })

  it('clears metadata when the connection is empty', () => {
    expect(
      buildCostDatabaseMetadata({
        driver: 'postgres',
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: '',
        database: '',
        schema: 'public',
        projectId: '',
        substationLot: '',
        schedule: '',
        currency: '',
        tableName: '',
        columnMap: emptyCostDatabaseColumnMap(),
        viewTables: emptyCostDatabaseViewTables(),
      }),
    ).toEqual({ [COST_DATABASE_META_KEY]: undefined })
  })

  it('pairs comma-separated schedule and currency values by index', () => {
    expect(parseCostDatabaseCsvList(' 土建, 安装 ，电气 ')).toEqual(['土建', '安装', '电气'])
    expect(pairCostDatabaseScheduleCurrencies('土建,安装', 'CNY,USD')).toEqual([
      { schedule: '土建', currency: 'CNY' },
      { schedule: '安装', currency: 'USD' },
    ])
    expect(pairCostDatabaseScheduleCurrencies('土建,安装,电气', 'CNY')).toEqual([
      { schedule: '土建', currency: 'CNY' },
      { schedule: '安装', currency: '' },
      { schedule: '电气', currency: '' },
    ])
    expect(
      lookupCostDatabaseScheduleCurrency(
        'Schedule4',
        'Schedule1, Schedule2, Schedule3, Schedule4',
        'USD, TZS, USD, TZS',
      ),
    ).toBe('TZS')
  })

  it('resolves per-view table bindings and falls back to the legacy table', () => {
    const connection = {
      ...readyConnection,
      viewTables: {
        budgetQuota: { tableName: '计量', columnMap: { name: '名称' } },
      },
    }
    expect(resolveCostDatabaseViewBinding(connection, 'constructionQuota').tableName).toBe('清单')
    expect(resolveCostDatabaseViewBinding(connection, 'budgetQuota')).toEqual({
      tableName: '计量',
      columnMap: { name: '名称' },
    })
    expect(resolveCostDatabaseViewBinding(connection, 'estimateQuota').tableName).toBe(
      COST_DATABASE_VIEW_DEFAULT_TABLES.estimateQuota,
    )
    expect(compactCostDatabaseViewTables(emptyCostDatabaseViewTables())).toEqual({})
  })

  it('defaults each data view to the matching local table', () => {
    const connection = { ...readyConnection, tableName: '', viewTables: {} }
    expect(resolveCostDatabaseViewBinding(connection, 'constructionQuota').tableName).toBe('boq_detail')
    expect(resolveCostDatabaseViewBinding(connection, 'budgetQuota').tableName).toBe('ipc_detail')
    expect(resolveCostDatabaseViewBinding(connection, 'estimateQuota').tableName).toBe('ipc_master')
    expect(resolveCostDatabaseViewBinding(connection, 'estimateIndicator').tableName).toBe('project_master')
  })

  it('matches inspected table names with or without schema prefixes', () => {
    const tables = ['public.boq_detail', 'public.ipc_detail']
    expect(matchCostDatabaseTableName(tables, 'boq_detail')).toBe('public.boq_detail')
    expect(columnsForCostDatabaseTable({ 'public.boq_detail': ['code', 'name'] }, 'boq_detail')).toEqual([
      'code',
      'name',
    ])
  })

  it('suggests Chinese and English column aliases', () => {
    const suggested = suggestCostDatabaseColumnMap([
      '项目编码',
      '工作名称',
      'Unit',
      '工程量',
      '综合单价',
      '备注',
    ])
    expect(suggested.code).toBe('项目编码')
    expect(suggested.name).toBe('工作名称')
    expect(suggested.unit).toBe('Unit')
    expect(suggested.quantity).toBe('工程量')
    expect(suggested.unitPrice).toBe('综合单价')
    expect(suggested.note).toBe('备注')
  })

  it('prefers the user map when the column still exists', () => {
    const resolved = resolveCostDatabaseColumnMap(
      { code: '清单编码', name: '已删除' },
      ['清单编码', '名称', '单位'],
    )
    expect(resolved.code).toBe('清单编码')
    expect(resolved.name).toBe('名称')
    expect(resolved.unit).toBe('单位')
  })

  it('matches mapped columns case-insensitively', () => {
    const resolved = resolveCostDatabaseColumnMap({ code: 'ITEM_CODE' }, ['item_code', 'item_name'])
    expect(resolved.code).toBe('item_code')
    expect(resolved.name).toBe('item_name')
  })

  it('resolves project_id column aliases', () => {
    expect(resolveProjectIdColumn(['id', 'name', 'project_id'])).toBe('project_id')
    expect(resolveProjectIdColumn(['编码', '项目编号'])).toBe('项目编号')
    expect(resolveProjectIdColumn(['code', 'name'])).toBeNull()
  })

  it('lists project and lot identifier columns without treating item 项目编码 as the project', () => {
    expect(
      listCostDatabaseIdentifierColumns(['项目编码', 'item_name', 'substation_lot', 'lot_code', '子项目']),
    ).toEqual(['substation_lot', 'lot_code'])
  })

  it('filters 获取 by project_id only when that column exists', () => {
    expect(
      resolveCostDatabaseProjectFilterColumns([
        'item',
        'description',
        'substation_lot',
        'project_id',
        'schedule',
      ]),
    ).toEqual(['project_id'])
    expect(resolveCostDatabaseProjectFilterColumns(['item', '子项目', 'description'])).toEqual([])
  })

  it('suggests EPC boq_detail column names', () => {
    const suggested = suggestCostDatabaseColumnMap([
      'item',
      'description',
      'unit',
      'est_qty',
      'unit_price',
      'schedule',
      'substation_lot',
      'project_id',
    ])
    expect(suggested.code).toBe('item')
    expect(suggested.featureDescription).toBe('description')
    expect(suggested.quantity).toBe('est_qty')
    expect(suggested.unitPrice).toBe('unit_price')
    expect(suggested.sectionalWork).toBe('schedule')
    expect(suggested.subproject).toBe('substation_lot')
  })

  it('resolves optional filter column aliases', () => {
    expect(resolveAliasColumn(['name', 'substation_lot'], COST_DATABASE_SUBSTATION_LOT_ALIASES)).toBe(
      'substation_lot',
    )
    expect(resolveAliasColumn(['schedule', 'qty'], COST_DATABASE_SCHEDULE_ALIASES)).toBe('schedule')
    expect(resolveAliasColumn(['货币', '单价'], COST_DATABASE_CURRENCY_ALIASES)).toBe('货币')
  })

  it('uses 中期计量 field keys without name / unit / type / quantity', () => {
    expect(fieldKeysForCostDatabaseView('budgetQuota')).toEqual([
      ...COST_DATABASE_METERING_VIEW_FIELD_KEYS,
    ])
    expect(fieldKeysForCostDatabaseView('constructionQuota')).not.toContain('periodQuantity')
    expect(fieldKeysForCostDatabaseView('budgetQuota')).not.toContain('name')
    expect(fieldKeysForCostDatabaseView('budgetQuota')).not.toContain('quantity')
  })

  it('uses 进度款统计 field keys without name / unit / quantity / unitPrice', () => {
    expect(fieldKeysForCostDatabaseView('estimateQuota')).toEqual([
      ...COST_DATABASE_PROGRESS_PAYMENT_VIEW_FIELD_KEYS,
    ])
    expect(fieldKeysForCostDatabaseView('estimateQuota')).not.toContain('name')
    expect(fieldKeysForCostDatabaseView('estimateQuota')).not.toContain('featureDescription')
    expect(fieldKeysForCostDatabaseView('estimateQuota')).not.toContain('unit')
    expect(fieldKeysForCostDatabaseView('estimateQuota')).not.toContain('quantity')
    expect(fieldKeysForCostDatabaseView('estimateQuota')).not.toContain('unitPrice')
    expect(fieldKeysForCostDatabaseView('estimateQuota')).toContain('currency')
    expect(fieldKeysForCostDatabaseView('estimateQuota')).toContain('periodClaimAmount')
    expect(fieldKeysForCostDatabaseView('estimateQuota')).toContain('payableAmount')
    expect(fieldKeysForCostDatabaseView('constructionQuota')).not.toContain('periodClaimAmount')
    expect(fieldKeysForCostDatabaseView('estimateIndicator')).not.toContain('billingPeriod')
  })

  it('suggests 进度款统计 payment columns by alias', () => {
    const suggested = suggestCostDatabaseColumnMap(
      ['编码', '货币', '账期', '本期申请金额', '应付金额', '申请日期'],
      fieldKeysForCostDatabaseView('estimateQuota'),
    )
    expect(suggested.currency).toBe('货币')
    expect(suggested.billingPeriod).toBe('账期')
    expect(suggested.periodClaimAmount).toBe('本期申请金额')
    expect(suggested.payableAmount).toBe('应付金额')
    expect(suggested.applicationDate).toBe('申请日期')
    expect(suggested.name).toBe('')
    expect(suggested.quantity).toBe('')
    expect(suggested.unitPrice).toBe('')
  })

  it('suggests 本期 / 往期 quantities for 中期计量 and falls back to 工程量', () => {
    const suggested = suggestCostDatabaseColumnMap(
      ['编码', '本期完成工程量', '往期完成工程量', '单价'],
      fieldKeysForCostDatabaseView('budgetQuota'),
    )
    expect(suggested.periodQuantity).toBe('本期完成工程量')
    expect(suggested.priorQuantity).toBe('往期完成工程量')
    expect(suggested.quantity).toBe('')
    expect(suggested.name).toBe('')

    const fallback = suggestCostDatabaseColumnMap(
      ['item', '工程量', 'unit_price'],
      fieldKeysForCostDatabaseView('budgetQuota'),
    )
    expect(fallback.periodQuantity).toBe('工程量')
    expect(fallback.code).toBe('item')
  })

  it('resolves a legacy 工程数量 map onto 本期完成工程量 for 中期计量', () => {
    const resolved = resolveCostDatabaseColumnMap(
      { quantity: 'qty' },
      ['qty', 'prior_qty'],
      fieldKeysForCostDatabaseView('budgetQuota'),
    )
    expect(resolved.periodQuantity).toBe('qty')
    expect(resolved.quantity).toBeUndefined()
  })

  it('parses localized numbers', () => {
    expect(parseCostDatabaseNumber('1,234.50')).toBe(1234.5)
    expect(parseCostDatabaseNumber('')).toBeNull()
    expect(parseCostDatabaseNumber(8)).toBe(8)
  })
})
