import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import ExcelJS from 'exceljs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { amountToEnglishWords, currencyWordsFor, integerToEnglishWords } from '../amountInWords'
import { safeWriteProgressCiData } from '../safeWriteProgressCiData'

const cellFillArgb = (cell: ExcelJS.Cell): string | undefined => {
  const fill = cell.fill as ExcelJS.FillPattern | undefined
  return fill?.fgColor?.argb
}

/** 构造与真实进度款发票一致的模板：头部信息 + 工程量清单 + 汇总区 + 英文大写 */
const buildInvoiceTemplate = async (filePath: string): Promise<void> => {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('发票')
  ws.getCell('A1').value = 'Contractor: TBEA CO.,LTD'
  ws.getCell('F1').value = 'COMMERICAL INVOICE'
  ws.getCell('A4').value = 'Contract No.:\nPA/001/2020-2021/HQ/W/46'
  ws.getCell('D4').value = 'Date:\n5 June, 2025'
  ws.getCell('F4').value = 'Invoice No.:\nTBEA-TAZASS-LOT 4-TDM-SCH 4-2025002 (IPC002)'
  ws.getCell('A5').value = 'PROJECT NAME: CONTRACT No. PA/001/2020-2021/HQW/46'
  ws.getCell('A6').value = 'Tunduma Substation'
  ws.getCell('A7').value = 'SCHEDULE 4: Installation Services (Erection, Testing and Commissioning)'

  ws.getCell('A8').value = 'ITEM'
  ws.getCell('B8').value = 'DESCRIPTION'
  ws.mergeCells('B8:D8')
  ws.getCell('E8').value = 'UNIT'
  ws.getCell('F8').value = 'Quantity'
  ws.getCell('G8').value = 'Unit price (TZS)'
  ws.getCell('H8').value = 'Total Price (TZS)'

  // 行 9 为空白分隔行，数据行 10-12
  const data: Array<[string, string, string, number, number]> = [
    ['19.0.1', 'Soil investigation works', 'lot', 1, 31396670.18],
    ['19.0.2.1', 'Grubbing and clearing works', 'lot', 1, 156983350.9],
    ['19.0.2.2', 'Cutting works', 'lot', 0.9, 313966701.8]
  ]
  data.forEach(([item, desc, unit, qty, price], i) => {
    const r = 10 + i
    ws.getCell(`A${r}`).value = item
    ws.getCell(`B${r}`).value = desc
    ws.mergeCells(`B${r}:D${r}`)
    ws.getCell(`E${r}`).value = unit
    ws.getCell(`F${r}`).value = qty
    ws.getCell(`G${r}`).value = price
    ws.getCell(`H${r}`).value = { formula: `G${r}*F${r}`, result: qty * price }
  })

  // 汇总区 13-21，A13:D21 为银行信息合并块
  ws.mergeCells('A13:D21')
  ws.getCell('A13').value = 'TBEA CO. LIMITED BANK ACCOUNT DETAILS'
  const summary: Array<[number, string, string, ExcelJS.CellValue]> = [
    [13, 'BOQ Value', 'A', { formula: 'SUM(H10:H12)', result: 1 }],
    [14, 'Advance Payment Recovery', 'B=20%A', { formula: 'H13*0.2', result: 1 }],
    [15, 'Retention on Completion Certificate', 'C=5%A', { formula: 'H13*0.05', result: 1 }],
    [16, 'Retention on Operational Certificate', 'D=5%A', { formula: 'H13*0.05', result: 1 }],
    [17, 'Retention on Defect Liability Period', 'E=5%A', { formula: 'H13*0.05', result: 1 }],
    [18, 'Deduction in total', 'F=B+C+D+E', { formula: 'SUM(H14:H17)', result: 1 }],
    [19, 'Net Payable excl VAT', 'H=A-F', { formula: 'H13-H18', result: 1 }],
    [20, 'VAT (exempted)', 'I=0', 0],
    [21, 'TOTAL TO BE PAID', 'J=H+I', { formula: 'H19+H20', result: 1 }]
  ]
  for (const [r, label, code, value] of summary) {
    ws.getCell(`E${r}`).value = label
    ws.getCell(`G${r}`).value = code
    ws.getCell(`H${r}`).value = value
  }

  ws.mergeCells('A22:H22')
  ws.getCell('A22').value = 'NET PAYABLE AMOUNT IN WORDS:  \nSAY TANZANIAN SHILLINGS OLD AMOUNT ONLY'

  await workbook.xlsx.writeFile(filePath)
}

describe('amountInWords', () => {
  it('converts integers with AND only in lowest group', () => {
    expect(integerToEnglishWords(306117534)).toBe(
      'THREE HUNDRED SIX MILLION ONE HUNDRED SEVENTEEN THOUSAND FIVE HUNDRED AND THIRTY-FOUR'
    )
    expect(integerToEnglishWords(0)).toBe('ZERO')
  })

  it('converts decimals as AND POINT XX', () => {
    expect(amountToEnglishWords(1234.26)).toBe('ONE THOUSAND TWO HUNDRED AND THIRTY-FOUR AND POINT TWENTY-SIX')
    expect(amountToEnglishWords(100.05)).toBe('ONE HUNDRED AND POINT ZERO FIVE')
  })

  it('maps currency codes to words', () => {
    expect(currencyWordsFor('USD')).toBe('US DOLLARS')
    expect(currencyWordsFor('tzs')).toBe('TANZANIAN SHILLINGS')
    expect(currencyWordsFor('XXX')).toBeNull()
  })
})

describe('safeWriteProgressCiData', () => {
  let tempDir: string
  let filePath: string

  beforeEach(async () => {
    // node:os 在 main.setup 中被全局 mock（无 tmpdir），改用测试目录下的临时目录
    tempDir = path.join(__dirname, `.tmp-progress-ci-${crypto.randomUUID()}`)
    await fs.mkdir(tempDir, { recursive: true })
    filePath = path.join(tempDir, 'SSLOT4-SCH1-IPC7.xlsx')
    await buildInvoiceTemplate(filePath)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  const baseRow = {
    estQty: undefined,
    previous: 0,
    endTotal: 0,
    proportion: undefined
  }

  const rows = [
    // 小节标题行：无单位/数量/价格
    {
      ...baseRow,
      item: '11',
      description: 'STEEL STRUCTURES',
      unit: '',
      unitPrice: 0,
      current: 0,
      currentTotalPrice: 0
    },
    {
      ...baseRow,
      item: '11.1',
      description: 'Gantry',
      unit: 'Ton',
      unitPrice: 100,
      current: 2,
      currentTotalPrice: 200
    },
    {
      ...baseRow,
      item: '11.2',
      description: 'Lighting mast',
      unit: 'Ton',
      unitPrice: 50,
      current: 1,
      currentTotalPrice: 50
    },
    {
      ...baseRow,
      item: '22.1',
      description: '400kV Circuit Breakers',
      unit: '',
      unitPrice: 0,
      current: 0,
      currentTotalPrice: 0
    },
    {
      ...baseRow,
      item: '22.1.1',
      description: 'Trip Coil',
      unit: 'PCS',
      unitPrice: 10,
      current: 3,
      currentTotalPrice: 30
    },
    {
      ...baseRow,
      item: '22.1.2',
      description: 'Closing Coil',
      unit: 'PCS',
      unitPrice: 20,
      current: 1,
      currentTotalPrice: 20
    }
  ]

  const runWrite = async (): Promise<ExcelJS.Worksheet> => {
    await safeWriteProgressCiData({
      outputPath: filePath,
      periodColumnHeader: 'IPC7',
      schDigit: 1,
      currency: 'USD',
      batchNumber: '2025004',
      rows
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)
    const ws = workbook.getWorksheet('发票')
    expect(ws).toBeDefined()
    return ws as ExcelJS.Worksheet
  }

  it('rewrites BOQ rows sequentially and expands data region', async () => {
    const ws = await runWrite()
    // 原数据行被清空重填：行 10 起为新明细
    expect(ws.getCell('A10').text).toBe('11')
    expect(ws.getCell('B10').text).toBe('STEEL STRUCTURES')
    // 小节行不写单位/数量/价格
    expect(ws.getCell('E10').text).toBe('')
    expect(ws.getCell('A11').text).toBe('11.1')
    expect(ws.getCell('F11').value).toBe(2)
    expect(ws.getCell('G11').value).toBe(100)
    const total11 = ws.getCell('H11').value as ExcelJS.CellFormulaValue
    expect(total11.formula).toBe('G11*F11')
    expect(total11.result).toBe(200)
    expect(ws.getCell('A15').text).toBe('22.1.2')
    // 原有 19.x 内容不再存在
    expect(ws.getCell('A12').text).not.toContain('19.0')
  })

  it('recomputes summary section with shifted formulas', async () => {
    const ws = await runWrite()
    // 插入 3 行后汇总区从 13 移到 16
    expect(ws.getCell('E16').text).toBe('BOQ Value')
    const a = ws.getCell('H16').value as ExcelJS.CellFormulaValue
    expect(a.formula).toBe('SUM(H10:H15)')
    expect(a.result).toBe(300)
    const b = ws.getCell('H17').value as ExcelJS.CellFormulaValue
    expect(b.formula).toBe('H16*0.2')
    expect(b.result).toBe(60)
    const f = ws.getCell('H21').value as ExcelJS.CellFormulaValue
    expect(f.result).toBe(105)
    const j = ws.getCell('H24').value as ExcelJS.CellFormulaValue
    expect(j.formula).toBe('H22+H23')
    expect(j.result).toBe(195)
    // 银行信息合并块随之下移
    expect(ws.getCell('A16').text).toContain('BANK ACCOUNT DETAILS')
  })

  it('updates header fields and highlights manual-confirm cells', async () => {
    const ws = await runWrite()
    const dateText = ws.getCell('D4').text
    expect(dateText.startsWith('Date:')).toBe(true)
    expect(dateText).toContain(String(new Date().getFullYear()))
    expect(cellFillArgb(ws.getCell('D4'))).toBe('FFFFFF00')

    const invoiceText = ws.getCell('F4').text
    expect(invoiceText).toContain('SCH 1-2025004')
    expect(invoiceText).toContain('(IPC007)')
    expect(cellFillArgb(ws.getCell('F4'))).toBe('FFFFFF00')

    expect(ws.getCell('A7').text).toMatch(/^SCHEDULE 1/)
    expect(cellFillArgb(ws.getCell('A7'))).toBe('FFFFFF00')

    // 站名无法自动判定：保留原值并高亮
    expect(ws.getCell('A6').text).toBe('Tunduma Substation')
    expect(cellFillArgb(ws.getCell('A6'))).toBe('FFFFFF00')

    // 表头货币 TZS → USD
    expect(ws.getCell('G8').text).toBe('Unit price (USD)')
    expect(ws.getCell('H8').text).toBe('Total Price (USD)')
  })

  it('regenerates amount in words from total to be paid', async () => {
    const ws = await runWrite()
    const words = ws.getCell('A25').text
    expect(words).toContain('NET PAYABLE AMOUNT IN WORDS')
    expect(words).toContain('SAY US DOLLARS ONE HUNDRED AND NINETY-FIVE ONLY')
  })

  it('shifts image anchors below inserted rows keeping size', async () => {
    // 1x1 透明 PNG，模拟汇总区附近的公章/签名图片（行 22-24，0 基 21-23）
    const TINY_PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.readFile(filePath)
      const sheet = wb.getWorksheet('发票') as ExcelJS.Worksheet
      const imageId = wb.addImage({ base64: TINY_PNG, extension: 'png' })
      sheet.addImage(imageId, {
        tl: { col: 3, row: 21 },
        br: { col: 5, row: 23 },
        editAs: 'oneCell'
      } as never)
      await wb.xlsx.writeFile(filePath)
    }

    const ws = await runWrite()
    const images = ws.getImages()
    expect(images).toHaveLength(1)
    const range = images[0].range as unknown as {
      tl: { nativeRow: number }
      br: { nativeRow: number }
    }
    // 插入 3 行后锚点整体下移，行跨度不变（保持图片尺寸与长宽比例）
    expect(range.tl.nativeRow).toBe(24)
    expect(range.br.nativeRow).toBe(26)
  })
})
