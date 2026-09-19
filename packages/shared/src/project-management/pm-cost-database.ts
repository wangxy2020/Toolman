import { z } from 'zod'

export const COST_DATABASE_META_KEY = 'costDatabase'

export const COST_DATABASE_DRIVERS = ['postgres', 'mysql'] as const

export type CostDatabaseDriver = (typeof COST_DATABASE_DRIVERS)[number]

export const COST_DATABASE_DEFAULT_PORTS: Record<CostDatabaseDriver, number> = {
  postgres: 5432,
  mysql: 3306,
}

export const COST_DATABASE_FIELD_KEYS = [
  'code',
  'name',
  'featureDescription',
  'unit',
  'quantity',
  'periodQuantity',
  'priorQuantity',
  'unitPrice',
  'sectionalWork',
  'subproject',
  'type',
  'note',
  'currency',
  'billingPeriod',
  'priceAdjustment',
  'priceCorrection',
  'applicationDate',
  'effectiveDate',
  'actualPaymentDate1',
  'actualPaymentDate2',
  'periodClaimAmount',
  'payableAmount',
] as const

export type CostDatabaseFieldKey = (typeof COST_DATABASE_FIELD_KEYS)[number]

/** Default 数据页 views (价格表 / 支付). */
export const COST_DATABASE_DEFAULT_VIEW_FIELD_KEYS = [
  'code',
  'name',
  'featureDescription',
  'unit',
  'quantity',
  'unitPrice',
  'sectionalWork',
  'subproject',
  'type',
  'note',
] as const satisfies readonly CostDatabaseFieldKey[]

/** 中期计量 column-map rows in 项目信息 · 数据. */
export const COST_DATABASE_METERING_VIEW_FIELD_KEYS = [
  'code',
  'periodQuantity',
  'priorQuantity',
  'unitPrice',
  'sectionalWork',
  'subproject',
  'note',
] as const satisfies readonly CostDatabaseFieldKey[]

/** 进度款统计 column-map rows in 项目信息 · 数据. */
export const COST_DATABASE_PROGRESS_PAYMENT_VIEW_FIELD_KEYS = [
  'code',
  'sectionalWork',
  'subproject',
  'type',
  'currency',
  'billingPeriod',
  'priceAdjustment',
  'priceCorrection',
  'applicationDate',
  'effectiveDate',
  'actualPaymentDate1',
  'actualPaymentDate2',
  'periodClaimAmount',
  'payableAmount',
  'note',
] as const satisfies readonly CostDatabaseFieldKey[]

export type CostDatabaseColumnMap = Partial<Record<CostDatabaseFieldKey, string>>

/** 成本管理-数据页四个视图，各自对应一张本地库表。 */
export const COST_DATABASE_VIEW_KEYS = [
  'constructionQuota',
  'budgetQuota',
  'estimateQuota',
  'estimateIndicator',
] as const

export type CostDatabaseViewKey = (typeof COST_DATABASE_VIEW_KEYS)[number]

export function fieldKeysForCostDatabaseView(
  viewKey: CostDatabaseViewKey,
): readonly CostDatabaseFieldKey[] {
  if (viewKey === 'budgetQuota') return COST_DATABASE_METERING_VIEW_FIELD_KEYS
  if (viewKey === 'estimateQuota') return COST_DATABASE_PROGRESS_PAYMENT_VIEW_FIELD_KEYS
  return COST_DATABASE_DEFAULT_VIEW_FIELD_KEYS
}

/** 数据页四个视图默认对应的本地库表。 */
export const COST_DATABASE_VIEW_DEFAULT_TABLES: Record<CostDatabaseViewKey, string> = {
  constructionQuota: 'boq_detail',
  budgetQuota: 'ipc_detail',
  estimateQuota: 'ipc_master',
  estimateIndicator: 'project_master',
}

export type CostDatabaseViewBinding = {
  tableName: string
  columnMap: CostDatabaseColumnMap
}

export type CostDatabaseViewTables = Partial<Record<CostDatabaseViewKey, CostDatabaseViewBinding>>

export type CostDatabaseInspectSnapshot = {
  tables: string[]
  columns: string[]
  tableCount: number
  columnCount: number
  rowCount: number
  tableColumns: Record<string, string[]>
}

export type CostDatabaseConnection = {
  driver: CostDatabaseDriver
  host: string
  port: number
  user: string
  password: string
  database: string
  schema: string
  projectId: string
  substationLot: string
  schedule: string
  currency: string
  tableName: string
  columnMap: CostDatabaseColumnMap
  viewTables: CostDatabaseViewTables
  inspect?: CostDatabaseInspectSnapshot
}

export type CostDatabaseImportedRow = {
  code: string
  name: string
  featureDescription: string
  unit: string
  quantity: number | null
  periodQuantity?: number | null
  priorQuantity?: number | null
  unitPrice: number | null
  sectionalWork: string
  subproject: string
  type: string
  note: string
  currency?: string
  billingPeriod?: string
  priceAdjustment?: number | null
  priceCorrection?: number | null
  applicationDate?: string
  effectiveDate?: string
  actualPaymentDate1?: string
  actualPaymentDate2?: string
  periodClaimAmount?: number | null
  payableAmount?: number | null
}

const COLUMN_ALIASES: Record<CostDatabaseFieldKey, readonly string[]> = {
  code: ['编码', '项目编码', '清单编码', '定额编码', 'code', 'itemcode', 'item_code', 'item', 'item_no', 'itemno', 'no'],
  name: ['名称', '工作名称', '项目名称', '清单名称', '定额名称', 'name', 'itemname', 'item_name'],
  featureDescription: ['特征描述', '项目特征', '描述', 'featuredescription', 'description', 'spec'],
  unit: ['单位', '计量单位', 'unit'],
  quantity: ['数量', '工程量', 'qty', 'quantity', 'est_qty', 'estqty', 'contract_total_qty'],
  periodQuantity: [
    '本期完成工程量',
    '本期工程量',
    '本期数量',
    'periodquantity',
    'period_qty',
    'periodqty',
    'current_qty',
    'this_period_qty',
  ],
  priorQuantity: [
    '往期完成工程量',
    '前期完成工程量',
    '往期工程量',
    '前期工程量',
    'priorquantity',
    'prior_qty',
    'priorqty',
    'previous_qty',
    'prev_qty',
  ],
  unitPrice: ['单价', '综合单价', 'unitprice', 'unit_price', 'price', 'rate'],
  sectionalWork: ['分部工程', '分部', '章节', 'sectionalwork', 'section', 'schedule'],
  subproject: ['子项目', '子目', 'subproject', 'subitem', 'substation_lot'],
  type: ['类型', '专业', 'type', 'category'],
  note: ['备注', '说明', 'note', 'remark', 'comment'],
  currency: ['货币', '币种', 'currency', 'curr'],
  billingPeriod: ['账期', '会计期', 'billingperiod', 'billing_period', 'period', 'account_period'],
  priceAdjustment: ['价格调整', '调价', 'priceadjustment', 'price_adjustment', 'adjustment'],
  priceCorrection: ['价格修正', '修正', 'pricecorrection', 'price_correction', 'correction'],
  applicationDate: ['申请日期', '申请日', 'applicationdate', 'application_date', 'apply_date'],
  effectiveDate: ['生效日期', '生效日', 'effectivedate', 'effective_date'],
  actualPaymentDate1: [
    '实际支付日期1',
    '实际支付日期',
    '支付日期1',
    'actualpaymentdate1',
    'actual_payment_date_1',
    'pay_date_1',
  ],
  actualPaymentDate2: [
    '实际支付日期2',
    '支付日期2',
    'actualpaymentdate2',
    'actual_payment_date_2',
    'pay_date_2',
  ],
  periodClaimAmount: [
    '本期申请金额',
    '申请金额',
    'periodclaimamount',
    'period_claim_amount',
    'claim_amount',
  ],
  payableAmount: ['应付金额', '应付款', 'payableamount', 'payable_amount', 'amount_payable'],
}

export const COST_DATABASE_PROJECT_ID_ALIASES = [
  'project_id',
  'projectid',
  'proj_id',
  'project_code',
  'projectcode',
  'project_no',
  'projectno',
  '项目编号',
  '工程编号',
  '工程代号',
  '项目号',
] as const

export const COST_DATABASE_SUBSTATION_LOT_ALIASES = [
  'substation_lot',
  'substationlot',
  '标段',
  '标段号',
  'lot',
  'lot_id',
  'lotid',
  'lot_no',
  'lotno',
  'lot_code',
  'lotcode',
] as const

export const COST_DATABASE_SCHEDULE_ALIASES = [
  'schedule',
  '分部工程划分',
  '分部工程',
  'sectionalwork',
  'section',
] as const

export const COST_DATABASE_CURRENCY_ALIASES = ['currency', '货币', '币种'] as const

const CostDatabaseColumnMapSchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  featureDescription: z.string().optional(),
  unit: z.string().optional(),
  quantity: z.string().optional(),
  periodQuantity: z.string().optional(),
  priorQuantity: z.string().optional(),
  unitPrice: z.string().optional(),
  sectionalWork: z.string().optional(),
  subproject: z.string().optional(),
  type: z.string().optional(),
  note: z.string().optional(),
  currency: z.string().optional(),
  billingPeriod: z.string().optional(),
  priceAdjustment: z.string().optional(),
  priceCorrection: z.string().optional(),
  applicationDate: z.string().optional(),
  effectiveDate: z.string().optional(),
  actualPaymentDate1: z.string().optional(),
  actualPaymentDate2: z.string().optional(),
  periodClaimAmount: z.string().optional(),
  payableAmount: z.string().optional(),
})

const CostDatabaseViewBindingSchema = z.object({
  tableName: z.string().max(128).default(''),
  columnMap: CostDatabaseColumnMapSchema.default({}),
})

const CostDatabaseViewTablesSchema = z.object({
  constructionQuota: CostDatabaseViewBindingSchema.optional(),
  budgetQuota: CostDatabaseViewBindingSchema.optional(),
  estimateQuota: CostDatabaseViewBindingSchema.optional(),
  estimateIndicator: CostDatabaseViewBindingSchema.optional(),
})

const CostDatabaseInspectSnapshotSchema = z.object({
  tables: z.array(z.string().max(160)).max(500).default([]),
  columns: z.array(z.string().max(128)).max(300).default([]),
  tableCount: z.coerce.number().int().nonnegative().default(0),
  columnCount: z.coerce.number().int().nonnegative().default(0),
  rowCount: z.coerce.number().int().nonnegative().default(0),
  tableColumns: z.record(z.string().max(160), z.array(z.string().max(128)).max(300)).default({}),
})

export const CostDatabaseConnectionSchema = z.object({
  driver: z.enum(COST_DATABASE_DRIVERS).default('postgres'),
  host: z.string().max(253),
  port: z.coerce.number().int().min(1).max(65535).default(5432),
  user: z.string().max(128),
  password: z.string().max(256),
  database: z.string().max(128),
  schema: z.string().max(128).default(''),
  projectId: z.string().max(128).default(''),
  substationLot: z.string().max(128).default(''),
  schedule: z.string().max(512).default(''),
  currency: z.string().max(512).default(''),
  tableName: z.string().max(128).default(''),
  columnMap: CostDatabaseColumnMapSchema.default({}),
  viewTables: CostDatabaseViewTablesSchema.default({}),
  inspect: CostDatabaseInspectSnapshotSchema.optional(),
})

export const PmCostDatabaseInspectInputSchema = z.object({
  driver: z.enum(COST_DATABASE_DRIVERS).default('postgres'),
  host: z.string().trim().min(1).max(253),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  user: z.string().max(128).default(''),
  password: z.string().max(256).default(''),
  database: z.string().trim().min(1).max(128),
  schema: z.string().max(128).optional(),
  tableName: z.string().trim().max(128).optional(),
})

export const PmCostDatabaseQueryInputSchema = z.object({
  driver: z.enum(COST_DATABASE_DRIVERS).default('postgres'),
  host: z.string().trim().min(1).max(253),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  user: z.string().max(128).default(''),
  password: z.string().max(256).default(''),
  database: z.string().trim().min(1).max(128),
  schema: z.string().max(128).optional(),
  projectId: z.string().trim().min(1).max(128),
  substationLot: z.string().max(128).optional(),
  schedule: z.string().max(512).optional(),
  currency: z.string().max(512).optional(),
  tableName: z.string().trim().max(128).optional(),
  columnMap: CostDatabaseColumnMapSchema.default({}),
  viewKey: z.enum(COST_DATABASE_VIEW_KEYS).optional(),
  workspaceId: z.string().trim().min(1).max(80).optional(),
  scopeId: z.string().trim().min(1).max(120).optional(),
})

export const PmCostDatabaseGetSyncedInputSchema = z.object({
  workspaceId: z.string().trim().min(1).max(80),
  scopeId: z.string().trim().min(1).max(120),
})

export type PmCostDatabaseInspectInput = z.infer<typeof PmCostDatabaseInspectInputSchema>
export type PmCostDatabaseQueryInput = z.infer<typeof PmCostDatabaseQueryInputSchema>
export type PmCostDatabaseGetSyncedInput = z.infer<typeof PmCostDatabaseGetSyncedInputSchema>

export type PmCostDatabaseInspectResult = {
  tables: string[]
  columns: string[]
  tableCount: number
  columnCount: number
  rowCount: number
  tableColumns: Record<string, string[]>
}

export function emptyCostDatabaseColumnMap(): Record<CostDatabaseFieldKey, string> {
  return {
    code: '',
    name: '',
    featureDescription: '',
    unit: '',
    quantity: '',
    periodQuantity: '',
    priorQuantity: '',
    unitPrice: '',
    sectionalWork: '',
    subproject: '',
    type: '',
    note: '',
    currency: '',
    billingPeriod: '',
    priceAdjustment: '',
    priceCorrection: '',
    applicationDate: '',
    effectiveDate: '',
    actualPaymentDate1: '',
    actualPaymentDate2: '',
    periodClaimAmount: '',
    payableAmount: '',
  }
}

export function emptyCostDatabaseViewTables(): Record<
  CostDatabaseViewKey,
  { tableName: string; columnMap: Record<CostDatabaseFieldKey, string> }
> {
  return {
    constructionQuota: {
      tableName: COST_DATABASE_VIEW_DEFAULT_TABLES.constructionQuota,
      columnMap: emptyCostDatabaseColumnMap(),
    },
    budgetQuota: {
      tableName: COST_DATABASE_VIEW_DEFAULT_TABLES.budgetQuota,
      columnMap: emptyCostDatabaseColumnMap(),
    },
    estimateQuota: {
      tableName: COST_DATABASE_VIEW_DEFAULT_TABLES.estimateQuota,
      columnMap: emptyCostDatabaseColumnMap(),
    },
    estimateIndicator: {
      tableName: COST_DATABASE_VIEW_DEFAULT_TABLES.estimateIndicator,
      columnMap: emptyCostDatabaseColumnMap(),
    },
  }
}

export function costDatabaseTableBareName(tableName: string): string {
  const trimmed = tableName.trim()
  const index = trimmed.lastIndexOf('.')
  return index >= 0 ? trimmed.slice(index + 1) : trimmed
}

export function matchCostDatabaseTableName(tables: readonly string[], preferred: string): string {
  const want = preferred.trim()
  if (!want) return ''
  const wantKey = want.toLowerCase()
  const exact = tables.find((table) => table.toLowerCase() === wantKey)
  if (exact) return exact
  const suffix = tables.find((table) => costDatabaseTableBareName(table).toLowerCase() === wantKey)
  if (suffix) return suffix
  const wantBare = costDatabaseTableBareName(want).toLowerCase()
  return tables.find((table) => costDatabaseTableBareName(table).toLowerCase() === wantBare) ?? want
}

export function columnsForCostDatabaseTable(
  tableColumns: Record<string, readonly string[]>,
  tableName: string,
): string[] {
  const matched = matchCostDatabaseTableName(Object.keys(tableColumns), tableName)
  return matched && tableColumns[matched] ? [...tableColumns[matched]] : []
}

export function isCostDatabaseViewKey(value: string): value is CostDatabaseViewKey {
  return (COST_DATABASE_VIEW_KEYS as readonly string[]).includes(value)
}

export function defaultCostDatabasePort(driver: CostDatabaseDriver): number {
  return COST_DATABASE_DEFAULT_PORTS[driver]
}

export function normalizeCostDatabaseColumnMap(
  raw: CostDatabaseColumnMap | undefined,
): Record<CostDatabaseFieldKey, string> {
  const next = emptyCostDatabaseColumnMap()
  if (!raw) return next
  for (const key of COST_DATABASE_FIELD_KEYS) {
    const value = raw[key]
    next[key] = typeof value === 'string' ? value.trim() : ''
  }
  return next
}

export function compactCostDatabaseColumnMap(
  raw: Record<CostDatabaseFieldKey, string> | CostDatabaseColumnMap,
): CostDatabaseColumnMap {
  const columnMap: CostDatabaseColumnMap = {}
  for (const key of COST_DATABASE_FIELD_KEYS) {
    const value = raw[key]?.trim() ?? ''
    if (value) columnMap[key] = value
  }
  return columnMap
}

export function parseCostDatabaseCsvList(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export type CostDatabaseScheduleCurrencyPair = {
  schedule: string
  currency: string
}

export function lookupCostDatabaseScheduleCurrency(
  sectionKey: string,
  schedule: string,
  currency: string,
): string {
  const key = sectionKey.trim()
  if (!key) return ''
  const pairs = pairCostDatabaseScheduleCurrencies(schedule, currency)
  const exact = pairs.find((pair) => pair.schedule === key)
  if (exact?.currency) return exact.currency
  const relaxed = pairs.find(
    (pair) => pair.schedule.localeCompare(key, undefined, { sensitivity: 'accent' }) === 0,
  )
  return relaxed?.currency ?? ''
}

export function pairCostDatabaseScheduleCurrencies(
  schedule: string,
  currency: string,
): CostDatabaseScheduleCurrencyPair[] {
  const schedules = parseCostDatabaseCsvList(schedule)
  const currencies = parseCostDatabaseCsvList(currency)
  const length = Math.max(schedules.length, currencies.length)
  const pairs: CostDatabaseScheduleCurrencyPair[] = []
  for (let index = 0; index < length; index += 1) {
    pairs.push({
      schedule: schedules[index] ?? '',
      currency: currencies[index] ?? '',
    })
  }
  return pairs
}

export function normalizeCostDatabaseViewTables(
  raw: CostDatabaseViewTables | undefined,
  fallback?: { tableName?: string; columnMap?: CostDatabaseColumnMap },
): Record<CostDatabaseViewKey, { tableName: string; columnMap: Record<CostDatabaseFieldKey, string> }> {
  const next = emptyCostDatabaseViewTables()
  for (const key of COST_DATABASE_VIEW_KEYS) {
    const binding = raw?.[key]
    const tableName = binding?.tableName?.trim() ?? ''
    next[key] = {
      tableName: tableName || COST_DATABASE_VIEW_DEFAULT_TABLES[key],
      columnMap: normalizeCostDatabaseColumnMap(binding?.columnMap),
    }
  }
  const fallbackTable = fallback?.tableName?.trim() ?? ''
  const fallbackMap = normalizeCostDatabaseColumnMap(fallback?.columnMap)
  const hasFallback = Boolean(fallbackTable) || Object.values(fallbackMap).some(Boolean)
  if (hasFallback && !raw?.constructionQuota) {
    next.constructionQuota = {
      tableName: fallbackTable || next.constructionQuota.tableName,
      columnMap: Object.values(fallbackMap).some(Boolean) ? fallbackMap : next.constructionQuota.columnMap,
    }
  }
  return next
}

export function isDefaultCostDatabaseViewTables(
  raw: Record<CostDatabaseViewKey, { tableName: string; columnMap: Record<CostDatabaseFieldKey, string> }>,
): boolean {
  return COST_DATABASE_VIEW_KEYS.every((key) => {
    const tableName = raw[key].tableName.trim()
    const columnMap = compactCostDatabaseColumnMap(raw[key].columnMap)
    return tableName === COST_DATABASE_VIEW_DEFAULT_TABLES[key] && Object.keys(columnMap).length === 0
  })
}

export function compactCostDatabaseViewTables(
  raw: Record<CostDatabaseViewKey, { tableName: string; columnMap: Record<CostDatabaseFieldKey, string> }>,
): CostDatabaseViewTables {
  const viewTables: CostDatabaseViewTables = {}
  for (const key of COST_DATABASE_VIEW_KEYS) {
    const tableName = raw[key].tableName.trim()
    const columnMap = compactCostDatabaseColumnMap(raw[key].columnMap)
    if (!tableName && Object.keys(columnMap).length === 0) continue
    if (tableName === COST_DATABASE_VIEW_DEFAULT_TABLES[key] && Object.keys(columnMap).length === 0) {
      continue
    }
    viewTables[key] = { tableName, columnMap }
  }
  return viewTables
}

/** Persist all four view bindings, including defaults and mapped columns. */
export function serializeCostDatabaseViewTables(
  raw: Record<CostDatabaseViewKey, { tableName: string; columnMap: Record<CostDatabaseFieldKey, string> }>,
): CostDatabaseViewTables {
  const normalized = normalizeCostDatabaseViewTables(raw)
  const viewTables: CostDatabaseViewTables = {}
  for (const key of COST_DATABASE_VIEW_KEYS) {
    viewTables[key] = {
      tableName: normalized[key].tableName.trim(),
      columnMap: compactCostDatabaseColumnMap(normalized[key].columnMap),
    }
  }
  return viewTables
}

export function compactCostDatabaseInspect(
  raw: CostDatabaseInspectSnapshot | null | undefined,
): CostDatabaseInspectSnapshot | undefined {
  if (!raw) return undefined
  const tables = raw.tables.map((table) => table.trim()).filter(Boolean)
  const tableColumns: Record<string, string[]> = {}
  for (const [table, columns] of Object.entries(raw.tableColumns ?? {})) {
    const name = table.trim()
    if (!name) continue
    tableColumns[name] = columns.map((column) => column.trim()).filter(Boolean)
  }
  if (tables.length === 0 && Object.keys(tableColumns).length === 0) return undefined
  return {
    tables,
    columns: (raw.columns ?? []).map((column) => column.trim()).filter(Boolean),
    tableCount: raw.tableCount,
    columnCount: raw.columnCount,
    rowCount: raw.rowCount,
    tableColumns,
  }
}

export function resolveCostDatabaseViewBinding(
  connection: CostDatabaseConnection,
  viewKey: CostDatabaseViewKey,
): { tableName: string; columnMap: CostDatabaseColumnMap } {
  const normalized = normalizeCostDatabaseViewTables(connection.viewTables, {
    tableName: connection.tableName,
    columnMap: connection.columnMap,
  })
  const binding = normalized[viewKey]
  return {
    tableName: binding.tableName,
    columnMap: compactCostDatabaseColumnMap(binding.columnMap),
  }
}

export function listMappedCostDatabaseViews(connection: CostDatabaseConnection): CostDatabaseViewKey[] {
  return COST_DATABASE_VIEW_KEYS.filter((key) => resolveCostDatabaseViewBinding(connection, key).tableName)
}

export function costDatabasePersistScopeId(scopeId: string, viewKey: CostDatabaseViewKey): string {
  return `${scopeId}::${viewKey}`
}

export function readCostDatabaseConnection(
  metadata: Record<string, unknown> | null | undefined,
): CostDatabaseConnection | null {
  const raw = metadata?.[COST_DATABASE_META_KEY]
  const parsed = CostDatabaseConnectionSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function isCostDatabaseConnectionReady(
  connection: CostDatabaseConnection | null | undefined,
): connection is CostDatabaseConnection {
  return Boolean(connection?.host.trim() && connection?.database.trim() && connection?.projectId.trim())
}

export function isAllowedLocalDatabaseHost(host: string): boolean {
  const value = host.trim().toLowerCase()
  if (!value) return false
  if (value === 'localhost' || value === '127.0.0.1' || value === '::1') return true
  if (value.endsWith('.local')) return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value)
  if (!ipv4) return false
  const octets = ipv4.slice(1).map(Number)
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = octets
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b != null && b >= 16 && b <= 31) return true
  return false
}

export function buildCostDatabaseMetadata(connection: {
  driver: CostDatabaseDriver
  host: string
  port: number | string
  user: string
  password: string
  database: string
  schema: string
  projectId: string
  substationLot: string
  schedule: string
  currency: string
  tableName?: string
  columnMap?: Record<CostDatabaseFieldKey, string>
  viewTables: Record<CostDatabaseViewKey, { tableName: string; columnMap: Record<CostDatabaseFieldKey, string> }>
  inspect?: CostDatabaseInspectSnapshot | null
}): Record<string, unknown> {
  const driver = connection.driver
  const host = connection.host.trim()
  const database = connection.database.trim()
  const schema = connection.schema.trim()
  const projectId = connection.projectId.trim()
  const substationLot = connection.substationLot.trim()
  const schedule = connection.schedule.trim()
  const currency = connection.currency.trim()
  const user = connection.user.trim()
  const password = connection.password
  const parsedPort = Number(connection.port)
  const port =
    Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535
      ? parsedPort
      : defaultCostDatabasePort(driver)
  const compactViews = compactCostDatabaseViewTables(connection.viewTables)
  const viewTables = serializeCostDatabaseViewTables(connection.viewTables)
  const construction = viewTables.constructionQuota
  const tableName = construction?.tableName?.trim() || connection.tableName?.trim() || ''
  const columnMap = construction?.columnMap ?? compactCostDatabaseColumnMap(connection.columnMap ?? emptyCostDatabaseColumnMap())
  const viewsAreDefault = isDefaultCostDatabaseViewTables(connection.viewTables)
  const hasViews = Object.keys(compactViews).length > 0
  const hasColumns = Object.keys(columnMap).length > 0
  const inspect = compactCostDatabaseInspect(connection.inspect)
  if (
    !database &&
    !projectId &&
    !substationLot &&
    !schedule &&
    !currency &&
    (!tableName || viewsAreDefault) &&
    !password &&
    !hasColumns &&
    !hasViews &&
    !inspect
  ) {
    return { [COST_DATABASE_META_KEY]: undefined }
  }
  return {
    [COST_DATABASE_META_KEY]: {
      driver,
      host: host || 'localhost',
      port,
      user,
      password,
      database,
      schema,
      projectId,
      substationLot,
      schedule,
      currency,
      tableName,
      columnMap,
      viewTables,
      ...(inspect ? { inspect } : {}),
    },
  }
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '')
}

export function resolveAliasColumn(
  columns: readonly string[],
  aliases: readonly string[],
): string | null {
  return resolveAliasColumns(columns, aliases)[0] ?? null
}

export function resolveAliasColumns(
  columns: readonly string[],
  aliases: readonly string[],
): string[] {
  const normalized = aliases.map(normalizeAlias)
  const matched: string[] = []
  const seen = new Set<string>()
  for (const column of columns) {
    if (!normalized.includes(normalizeAlias(column))) continue
    const key = column.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    matched.push(column)
  }
  return matched
}

export function listCostDatabaseIdentifierColumns(columns: readonly string[]): string[] {
  const matched: string[] = []
  const seen = new Set<string>()
  for (const column of [
    ...resolveAliasColumns(columns, COST_DATABASE_PROJECT_ID_ALIASES),
    ...resolveAliasColumns(columns, COST_DATABASE_SUBSTATION_LOT_ALIASES),
  ]) {
    const key = column.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    matched.push(column)
  }
  return matched
}

/** Prefer the project_id column so 获取 is one query: all rows for that project. */
export function resolveCostDatabaseProjectFilterColumns(columns: readonly string[]): string[] {
  const projectIdColumn = resolveProjectIdColumn(columns)
  return projectIdColumn ? [projectIdColumn] : listCostDatabaseIdentifierColumns(columns)
}

export function resolveProjectIdColumn(columns: readonly string[]): string | null {
  return resolveAliasColumn(columns, COST_DATABASE_PROJECT_ID_ALIASES)
}

export function suggestCostDatabaseColumnMap(
  columns: readonly string[],
  fieldKeys: readonly CostDatabaseFieldKey[] = COST_DATABASE_DEFAULT_VIEW_FIELD_KEYS,
): Record<CostDatabaseFieldKey, string> {
  const next = emptyCostDatabaseColumnMap()
  const normalized = columns
    .map((column) => ({ column, key: normalizeAlias(column) }))
    .filter((entry) => entry.key)
  for (const field of fieldKeys) {
    const aliases = COLUMN_ALIASES[field].map(normalizeAlias)
    const match = normalized.find((entry) => aliases.includes(entry.key))
    if (match) next[field] = match.column
  }
  if (fieldKeys.includes('periodQuantity') && !next.periodQuantity) {
    const quantityAliases = COLUMN_ALIASES.quantity.map(normalizeAlias)
    const match = normalized.find((entry) => quantityAliases.includes(entry.key))
    if (match) next.periodQuantity = match.column
  }
  return next
}

export function findCostDatabaseColumn(columns: readonly string[], name: string): string | undefined {
  const want = name.trim()
  if (!want) return undefined
  const exact = columns.find((column) => column === want)
  if (exact) return exact
  const lower = want.toLowerCase()
  return columns.find((column) => column.toLowerCase() === lower)
}

export function resolveCostDatabaseColumnMap(
  userMap: CostDatabaseColumnMap,
  columns: readonly string[],
  fieldKeys: readonly CostDatabaseFieldKey[] = COST_DATABASE_DEFAULT_VIEW_FIELD_KEYS,
): CostDatabaseColumnMap {
  const suggested = suggestCostDatabaseColumnMap(columns, fieldKeys)
  const resolved: CostDatabaseColumnMap = {}
  for (const key of fieldKeys) {
    const preferred = findCostDatabaseColumn(columns, userMap[key] ?? '')
    if (preferred) {
      resolved[key] = preferred
      continue
    }
    if (
      key === 'periodQuantity' &&
      !userMap.periodQuantity &&
      userMap.quantity
    ) {
      const legacy = findCostDatabaseColumn(columns, userMap.quantity)
      if (legacy) {
        resolved.periodQuantity = legacy
        continue
      }
    }
    if (suggested[key]) resolved[key] = suggested[key]
  }
  return resolved
}

export function parseCostDatabaseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseCostDatabaseText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

export function parseCostDatabaseImportedRows(raw: unknown): CostDatabaseImportedRow[] | null {
  if (!Array.isArray(raw)) return null
  const rows: CostDatabaseImportedRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const row = item as Record<string, unknown>
    rows.push({
      code: parseCostDatabaseText(row.code),
      name: parseCostDatabaseText(row.name),
      featureDescription: parseCostDatabaseText(row.featureDescription),
      unit: parseCostDatabaseText(row.unit),
      quantity: parseCostDatabaseNumber(row.quantity),
      periodQuantity: parseCostDatabaseNumber(row.periodQuantity),
      priorQuantity: parseCostDatabaseNumber(row.priorQuantity),
      unitPrice: parseCostDatabaseNumber(row.unitPrice),
      sectionalWork: parseCostDatabaseText(row.sectionalWork),
      subproject: parseCostDatabaseText(row.subproject),
      type: parseCostDatabaseText(row.type),
      note: parseCostDatabaseText(row.note),
      currency: parseCostDatabaseText(row.currency),
      billingPeriod: parseCostDatabaseText(row.billingPeriod),
      priceAdjustment: parseCostDatabaseNumber(row.priceAdjustment),
      priceCorrection: parseCostDatabaseNumber(row.priceCorrection),
      applicationDate: parseCostDatabaseText(row.applicationDate),
      effectiveDate: parseCostDatabaseText(row.effectiveDate),
      actualPaymentDate1: parseCostDatabaseText(row.actualPaymentDate1),
      actualPaymentDate2: parseCostDatabaseText(row.actualPaymentDate2),
      periodClaimAmount: parseCostDatabaseNumber(row.periodClaimAmount),
      payableAmount: parseCostDatabaseNumber(row.payableAmount),
    })
  }
  return rows
}
