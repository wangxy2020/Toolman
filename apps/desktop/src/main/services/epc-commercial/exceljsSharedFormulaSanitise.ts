import ExcelJS from 'exceljs'

const hasFormula = (cell: ExcelJS.Cell): boolean => cell.formulaType !== ExcelJS.FormulaType.None

/**
 * ExcelJS 在修改单元格后无法可靠地重新序列化 shared formula。
 * 写入前将共享公式展开为独立公式（或缓存结果），避免
 * "Shared Formula master must exist above and or left of clone" 错误。
 */
export function sanitiseWorkbookSharedFormulas(workbook: ExcelJS.Workbook): void {
  for (const worksheet of workbook.worksheets) {
    sanitiseWorksheetSharedFormulas(worksheet)
  }
}

export function sanitiseWorksheetSharedFormulas(worksheet: ExcelJS.Worksheet): void {
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (!hasFormula(cell)) {
        return
      }
      const formula = cell.formula
      if (!formula) {
        if (cell.formulaType === ExcelJS.FormulaType.Shared) {
          cell.value = cell.result ?? null
        }
        return
      }
      const result = cell.result
      cell.value =
        result !== undefined && result !== null ? { formula, result } : { formula }
    })
  })
}

export { hasFormula }
