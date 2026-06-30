import fs from 'node:fs'
import path from 'node:path'

import { loggerService } from '@logger'
import { rustPropagatePmDataAfterEdit } from '@main/services/epcCommercial/rustCli'
import type {
  PmAlignedCellLock,
  PmPaymentDataPatch,
  PmPaymentRowMatch,
  PmRevisionsFile
} from '@shared/projectManagementRevision'
import {
  emptyPmRevisionsFile,
  isPmDataPathForDomain,
  isPmIpcCleanedCsvPath,
  pmRevisionsPath,
  relativePathInWorkspace
} from '@shared/projectManagementRevision'
import * as XLSX from '@e965/xlsx'

const logger = loggerService.withContext('ProjectManagementRevisionService')

const PAYMENT_ROW_KEY_FIELDS = ['project_id', 'substation_lot', 'schedule', 'ipc_no'] as const
const PROJECT_ROW_KEY_FIELDS = ['project_id', 'substation_lot', 'schedule'] as const

const readJsonFile = (filePath: string): PmRevisionsFile => {
  if (!fs.existsSync(filePath)) {
    return emptyPmRevisionsFile()
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PmRevisionsFile
    if (!parsed?.domains) {
      return emptyPmRevisionsFile()
    }
    return parsed
  } catch {
    return emptyPmRevisionsFile()
  }
}

const writeJsonFile = (filePath: string, data: PmRevisionsFile): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

const migrateLegacyPaymentOverrides = (workspaceRoot: string, file: PmRevisionsFile): PmRevisionsFile => {
  if (file.domains.cost_epc_payment.patches.length > 0) {
    return file
  }
  const legacy = path.join(workspaceRoot, 'IPC_Payment_data', 'data_overrides.json')
  if (!fs.existsSync(legacy)) {
    return file
  }
  try {
    const legacyJson = JSON.parse(fs.readFileSync(legacy, 'utf-8')) as {
      paymentPatches?: PmPaymentDataPatch[]
    }
    if (legacyJson.paymentPatches?.length) {
      file.domains.cost_epc_payment.patches = legacyJson.paymentPatches
      logger.info('Migrated legacy payment overrides into pm revisions', { workspaceRoot })
    }
  } catch (error) {
    logger.warn('Failed to migrate legacy payment overrides', { error })
  }
  return file
}

export const readPmRevisions = (workspaceRoot: string): PmRevisionsFile => {
  const filePath = pmRevisionsPath(workspaceRoot)
  let file = readJsonFile(filePath)
  file = migrateLegacyPaymentOverrides(workspaceRoot, file)
  return file
}

export const writePmRevisions = (workspaceRoot: string, file: PmRevisionsFile): void => {
  writeJsonFile(pmRevisionsPath(workspaceRoot), file)
}

const cellString = (value: unknown): string => {
  if (value == null) {
    return ''
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return String(value).trim()
}

const readWorkbookSheets = (filePath: string): Record<string, string[][]> | null => {
  if (!fs.existsSync(filePath)) {
    return null
  }
  try {
    const buffer = fs.readFileSync(filePath)
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const out: Record<string, string[][]> = {}
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) {
        continue
      }
      const rows = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(sheet, {
        header: 1,
        raw: false,
        defval: ''
      })
      out[sheetName] = rows.map((row) => (Array.isArray(row) ? row.map(cellString) : []))
    }
    return out
  } catch (error) {
    logger.warn('Failed to read workbook for revision diff', { filePath, error })
    return null
  }
}

const mergePaymentPatch = (patches: PmPaymentDataPatch[], patch: PmPaymentDataPatch): void => {
  const existing = patches.find((p) =>
    patch.rowKey && p.rowKey ? p.rowKey === patch.rowKey : rowMatchEqual(p.match, patch.match, true)
  )
  if (existing) {
    Object.assign(existing.values, patch.values)
    if (patch.rowKey) {
      existing.rowKey = patch.rowKey
    }
    for (const field of patch.lock ?? []) {
      if (!existing.lock?.includes(field)) {
        existing.lock = [...(existing.lock ?? []), field]
      }
    }
    existing.source = patch.source ?? existing.source
  } else {
    patches.push(patch)
  }
}

const rowMatchEqual = (a: PmPaymentRowMatch, b: PmPaymentRowMatch, requireIpcNo: boolean): boolean => {
  const norm = (v?: string) => (v ?? '').trim().toUpperCase()
  const normSch = (v?: string) => {
    const d = (v ?? '').replace(/\D/g, '')
    return d || (v ?? '').trim().toLowerCase()
  }
  const normIpc = (v?: string) => {
    const m = (v ?? '').trim().match(/ipc\s*0*(\d+)/i)
    return m ? `IPC${Number.parseInt(m[1], 10)}` : norm(v)
  }
  if (requireIpcNo) {
    if (!a.ipc_no?.trim() || !b.ipc_no?.trim()) {
      return false
    }
    if (normIpc(a.ipc_no) !== normIpc(b.ipc_no)) {
      return false
    }
  } else if (a.ipc_no?.trim() && b.ipc_no?.trim() && normIpc(a.ipc_no) !== normIpc(b.ipc_no)) {
    return false
  }
  return (
    norm(a.project_id) === norm(b.project_id) &&
    norm(a.substation_lot) === norm(b.substation_lot) &&
    normSch(a.schedule) === normSch(b.schedule)
  )
}

/** 与 Rust payment_row_key_from_values / load_payment_rows 主键一致 */
const PAYMENT_METADATA_CSV_COLUMNS = ['effective_date', 'period', 'due_date'] as const

const parseCsvLine = (line: string): string[] => {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

const readCsvTable = (filePath: string): string[][] | null => {
  if (!fs.existsSync(filePath)) {
    return null
  }
  try {
    const lines = fs
      .readFileSync(filePath, 'utf-8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
    return lines.map(parseCsvLine)
  } catch {
    return null
  }
}

/** 清洗 CSV 若含 effective_date 等列，记入 payment 修订层（仅锁定对应行） */
const recordCsvPaymentMetadataToRevisions = (
  workspaceRoot: string,
  csvPath: string,
  beforeSnapshotPath?: string | null
): void => {
  const afterRows = readCsvTable(csvPath)
  if (!afterRows?.length) {
    return
  }
  const headers = afterRows[0] ?? []
  const headerIndex = (name: string): number =>
    headers.findIndex((h) => h.trim().toLowerCase().replace(/\s+/g, '_') === name)
  const hasMeta = PAYMENT_METADATA_CSV_COLUMNS.some((c) => headerIndex(c) >= 0)
  if (!hasMeta) {
    return
  }

  const beforeRows = beforeSnapshotPath ? readCsvTable(beforeSnapshotPath) : null
  const revisions = readPmRevisions(workspaceRoot)
  const now = new Date().toISOString()

  for (let r = 1; r < afterRows.length; r++) {
    const afterRow = afterRows[r] ?? []
    const beforeRow = beforeRows?.[r]
    const rowKey = buildPaymentRowKey(afterRow, headers, true)
    if (!rowKey) {
      continue
    }
    const values: Record<string, string> = {}
    const lock: string[] = []
    for (const field of PAYMENT_METADATA_CSV_COLUMNS) {
      const idx = headerIndex(field)
      if (idx < 0) {
        continue
      }
      const afterVal = afterRow[idx] ?? ''
      const beforeVal = beforeRow?.[idx] ?? ''
      if (afterVal && afterVal !== beforeVal) {
        values[field] = afterVal
        lock.push(field)
      }
    }
    if (Object.keys(values).length === 0) {
      continue
    }
    mergePaymentPatch(revisions.domains.cost_epc_payment.patches, {
      match: parseRowMatch(afterRow, headers, true),
      rowKey,
      values,
      lock,
      source: 'llm',
      at: now
    })
  }
  writePmRevisions(workspaceRoot, revisions)
}

const buildPaymentRowKey = (row: string[], headers: string[], includeIpcNo: boolean): string | null => {
  const read = (field: string): string => {
    const idx = headers.findIndex((h) => h.trim() === field)
    return idx >= 0 ? (row[idx] ?? '').trim() : ''
  }
  const projectId = read('project_id')
  const substationLot = read('substation_lot')
  const schedule = read('schedule')
  if (!projectId || !schedule) {
    return null
  }
  if (includeIpcNo) {
    const ipcNo = read('ipc_no')
    if (!ipcNo) {
      return null
    }
    return `${projectId}|${substationLot}|${schedule}|${ipcNo}`
  }
  return `${projectId}|${substationLot}|${schedule}`
}

const buildPaymentPatchesFromSheetDiff = (
  beforeRows: string[][],
  afterRows: string[][],
  includeIpcNo: boolean
): PmPaymentDataPatch[] => {
  if (afterRows.length < 2) {
    return []
  }
  const headers = afterRows[0] ?? []
  const beforeByKey = new Map<string, string[]>()
  if (beforeRows.length >= 2) {
    const beforeHeaders = beforeRows[0] ?? []
    for (let r = 1; r < beforeRows.length; r++) {
      const row = beforeRows[r] ?? []
      const key = buildRowKey(row, beforeHeaders, includeIpcNo)
      if (key) {
        beforeByKey.set(key, row)
      }
    }
  }

  const patches: PmPaymentDataPatch[] = []
  for (let r = 1; r < afterRows.length; r++) {
    const afterRow = afterRows[r] ?? []
    const key = buildRowKey(afterRow, headers, includeIpcNo)
    if (!key) {
      continue
    }
    const beforeRow = beforeByKey.get(key)
    const values: Record<string, string> = {}
    const lock: string[] = []
    for (let c = 0; c < headers.length; c++) {
      const field = headers[c]?.trim()
      if (!field) {
        continue
      }
      const afterVal = afterRow[c] ?? ''
      const beforeVal = beforeRow?.[c] ?? ''
      if (afterVal !== beforeVal) {
        values[field] = afterVal
        lock.push(field)
      }
    }
    if (Object.keys(values).length === 0) {
      continue
    }
    const rowKey = buildPaymentRowKey(afterRow, headers, includeIpcNo)
    if (!rowKey) {
      continue
    }
    patches.push({
      match: parseRowMatch(afterRow, headers, includeIpcNo),
      rowKey,
      values,
      lock,
      source: 'llm',
      at: new Date().toISOString()
    })
  }
  return patches
}

const buildRowKey = (row: string[], headers: string[], includeIpcNo: boolean): string | null => {
  const fields = includeIpcNo ? PAYMENT_ROW_KEY_FIELDS : PROJECT_ROW_KEY_FIELDS
  const parts: string[] = []
  for (const field of fields) {
    const idx = headers.findIndex((h) => h.trim() === field)
    const val = idx >= 0 ? (row[idx] ?? '').trim() : ''
    if (field !== 'substation_lot' && !val) {
      return null
    }
    parts.push(val.toUpperCase())
  }
  return parts.join('|')
}

const parseRowMatch = (row: string[], headers: string[], includeIpcNo: boolean): PmPaymentRowMatch => {
  const read = (field: string): string | undefined => {
    const idx = headers.findIndex((h) => h.trim() === field)
    const val = idx >= 0 ? (row[idx] ?? '').trim() : ''
    return val || undefined
  }
  return {
    project_id: read('project_id'),
    substation_lot: read('substation_lot'),
    schedule: read('schedule'),
    ipc_no: includeIpcNo ? read('ipc_no') : undefined
  }
}

const buildAlignedCellLocksFromDiff = (
  relativePath: string,
  beforeSheets: Record<string, string[][]> | null,
  afterSheets: Record<string, string[][]>
): PmAlignedCellLock[] => {
  const locks: PmAlignedCellLock[] = []
  const now = new Date().toISOString()
  for (const [sheetName, afterRows] of Object.entries(afterSheets)) {
    const beforeRows = beforeSheets?.[sheetName]
    const maxR = afterRows.length
    for (let r = 0; r < maxR; r++) {
      const afterRow = afterRows[r] ?? []
      const beforeRow = beforeRows?.[r]
      const maxC = afterRow.length
      for (let c = 0; c < maxC; c++) {
        const afterVal = afterRow[c] ?? ''
        const beforeVal = beforeRow?.[c] ?? ''
        if (afterVal !== beforeVal) {
          locks.push({
            relativePath,
            sheet: sheetName,
            row: r,
            col: c,
            value: afterVal,
            lock: true,
            source: 'llm',
            at: now
          })
        }
      }
    }
  }
  return locks
}

const mergeAlignedLock = (existing: PmAlignedCellLock[], lock: PmAlignedCellLock): void => {
  const rel = lock.relativePath.replace(/\\/g, '/').toLowerCase()
  const hit = existing.find(
    (c) =>
      c.relativePath.replace(/\\/g, '/').toLowerCase() === rel &&
      c.sheet === lock.sheet &&
      c.row === lock.row &&
      c.col === lock.col
  )
  if (hit) {
    hit.value = lock.value
    hit.lock = true
    hit.source = lock.source
    hit.at = lock.at
  } else {
    existing.push(lock)
  }
}

/** 大模型 Write/Edit 成功后：对比变更并写入 revisions.json，并向下游传播衍生字段 */
export const recordPmDataFileWriteDiff = async (params: {
  workspaceRoot: string
  filePath: string
  beforeSnapshotPath?: string | null
}): Promise<void> => {
  const { workspaceRoot, filePath, beforeSnapshotPath } = params
  const resolved = path.resolve(filePath)
  const root = path.resolve(workspaceRoot)
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return
  }

  const isCsv = isPmIpcCleanedCsvPath(resolved, workspaceRoot)
  const isPaymentOrAligned =
    isPmDataPathForDomain(resolved, workspaceRoot, 'cost_epc_payment') ||
    isPmDataPathForDomain(resolved, workspaceRoot, 'cost_epc_aligned')

  if (!isCsv && !isPaymentOrAligned) {
    return
  }

  if (isCsv) {
    recordCsvPaymentMetadataToRevisions(workspaceRoot, resolved, beforeSnapshotPath)
  }

  if (isPaymentOrAligned) {
    const afterSheets = readWorkbookSheets(resolved)
    if (!afterSheets) {
      return
    }

    const beforeSheets = beforeSnapshotPath ? readWorkbookSheets(beforeSnapshotPath) : null
    const rel = relativePathInWorkspace(workspaceRoot, resolved)
    const revisions = readPmRevisions(workspaceRoot)
    const now = new Date().toISOString()

    if (isPmDataPathForDomain(resolved, workspaceRoot, 'cost_epc_payment')) {
      const sheet = Object.values(afterSheets)[0]
      const beforeSheet = beforeSheets ? Object.values(beforeSheets)[0] : undefined
      if (sheet) {
        const isPayment = rel.toLowerCase().includes('ipc_payment_data')
        const patches = buildPaymentPatchesFromSheetDiff(beforeSheet ?? [], sheet, isPayment)
        for (const patch of patches) {
          patch.at = now
          mergePaymentPatch(revisions.domains.cost_epc_payment.patches, patch)
        }
      }
    }

    if (isPmDataPathForDomain(resolved, workspaceRoot, 'cost_epc_aligned')) {
      const locks = buildAlignedCellLocksFromDiff(rel, beforeSheets, afterSheets)
      for (const lock of locks) {
        mergeAlignedLock(revisions.domains.cost_epc_aligned.cellLocks, lock)
      }
    }

    writePmRevisions(workspaceRoot, revisions)
    logger.info('Recorded PM data file revision diff', { rel, workspaceRoot })
  }

  try {
    const propagate = await rustPropagatePmDataAfterEdit({
      workspaceRoot,
      editedFilePath: resolved
    })
    if (!propagate.ok) {
      logger.warn('PM data propagate after edit failed', {
        filePath: resolved,
        error: propagate.errorMessage
      })
    } else if (propagate.actions?.length) {
      logger.info('PM data propagate after edit completed', {
        filePath: resolved,
        actions: propagate.actions
      })
    }
  } catch (error) {
    logger.warn('PM data propagate after edit threw', { filePath: resolved, error })
  }
}

export const snapshotPmDataFile = (filePath: string): string | null => {
  if (!fs.existsSync(filePath)) {
    return null
  }
  const ext = path.extname(filePath) || '.xlsx'
  const tmp = path.join(
    path.dirname(filePath),
    `.pm-revision-snapshot-${process.pid}-${Date.now()}${ext}`
  )
  try {
    fs.copyFileSync(filePath, tmp)
    return tmp
  } catch (error) {
    logger.warn('Failed to snapshot PM data file', { filePath, error })
    return null
  }
}

export const cleanupRevisionSnapshot = (snapshotPath: string | null | undefined): void => {
  if (!snapshotPath) {
    return
  }
  try {
    if (fs.existsSync(snapshotPath)) {
      fs.unlinkSync(snapshotPath)
    }
  } catch {
    // ignore
  }
}

export const projectManagementRevisionService = {
  readPmRevisions,
  writePmRevisions,
  recordPmDataFileWriteDiff,
  snapshotPmDataFile,
  cleanupRevisionSnapshot
}
