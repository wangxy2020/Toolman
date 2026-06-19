import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

export function extractSpreadsheetPlainText(filePath: string): string {
  const workbook = XLSX.read(readFileSync(filePath), { type: 'buffer' })
  const parts: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim()
    if (!csv) continue
    parts.push(workbook.SheetNames.length > 1 ? `## ${sheetName}\n${csv}` : csv)
  }

  return parts.join('\n\n').trim()
}
