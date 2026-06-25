import { describe, expect, it } from 'vitest'

import {
  buildAmountInWordsCellValue,
  formatUsdAmountInWords,
  findAmountInWordsCellFromSnapshot,
  normalizeExcelReviewIssues,
  parseExcelReviewIssues,
  requestsExcelDirectFix,
} from './excel-review.service'
import type { ExcelReadSnapshot } from './excel-mcp-task.service'

describe('parseExcelReviewIssues', () => {
  it('parses modify and highlight issues', () => {
    const { issues, warnings } = parseExcelReviewIssues(
      JSON.stringify([
        {
          id: '1',
          severity: 'high',
          category: 'error',
          action: 'modify',
          sheet: 'Sheet1',
          cell: 'b12',
          value: 'ONE THOUSAND ONE HUNDRED SIXTY-EIGHT AND FORTY-NINE CENTS ONLY.',
        },
        {
          id: '2',
          severity: 'medium',
          category: 'format',
          action: 'highlight',
          sheet: 'Sheet1',
          cell: 'A10',
          comment: '请核对合计',
        },
      ]),
    )

    expect(warnings).toEqual([])
    expect(issues).toHaveLength(2)
    expect(issues[0]?.cell).toBe('B12')
    expect(issues[0]?.action).toBe('modify')
    expect(issues[1]?.action).toBe('highlight')
  })
})

describe('formatUsdAmountInWords', () => {
  it('formats invoice amount in words', () => {
    expect(formatUsdAmountInWords(1168.49)).toBe(
      'SAY U.S. DOLLARS ONE THOUSAND ONE HUNDRED SIXTY-EIGHT AND FORTY-NINE CENTS ONLY.',
    )
  })
})

describe('buildAmountInWordsCellValue', () => {
  it('preserves NET PAYABLE AMOUNT IN WORDS label', () => {
    const existing =
      'NET PAYABLE AMOUNT IN WORDS:\nSAY U.S. DOLLARS ONE THOUSAND ONE HUNDRED FIFTY-TWO AND FOURTY-EIGHT CENTS ONLY.'
    expect(buildAmountInWordsCellValue(existing, 1168.49)).toBe(
      'NET PAYABLE AMOUNT IN WORDS:\nSAY U.S. DOLLARS ONE THOUSAND ONE HUNDRED SIXTY-EIGHT AND FORTY-NINE CENTS ONLY.',
    )
  })
})

describe('findAmountInWordsCellFromSnapshot', () => {
  it('prefers AMOUNT IN WORDS row over numeric total column', () => {
    const cell = findAmountInWordsCellFromSnapshot('Invoice', {
      sheetNames: ['Invoice'],
      cellsBySheet: {
        Invoice: {
          H22: '1168.49',
          H23: 'ONE THOUSAND ONE HUNDRED SIXTY-EIGHT AND FORTY-NINE CENTS ONLY.',
          A26:
            'NET PAYABLE AMOUNT IN WORDS:\nSAY U.S. DOLLARS ONE THOUSAND ONE HUNDRED FIFTY-TWO AND FOURTY-EIGHT CENTS ONLY.',
        },
      },
      mergesBySheet: { Invoice: ['A26:H26'] },
    })
    expect(cell).toBe('A26')
  })
})

describe('normalizeExcelReviewIssues', () => {
  const snapshot: ExcelReadSnapshot = {
    sheetNames: ['Invoice'],
    cellsBySheet: {
      Invoice: {
        H22: '1168.49',
        A26:
          'NET PAYABLE AMOUNT IN WORDS:\nSAY U.S. DOLLARS ONE THOUSAND ONE HUNDRED FIFTY-TWO AND FOURTY-EIGHT CENTS ONLY.',
        A7: '',
        B7: '',
      },
    },
    mergesBySheet: {
      Invoice: ['A7:C7', 'A26:H26'],
    },
  }

  it('maps Sheet1 to actual sheet and snaps empty cell to row content', () => {
    const { issues } = parseExcelReviewIssues(
      JSON.stringify([
        {
          id: '1',
          action: 'highlight',
          severity: 'medium',
          category: 'error',
          sheet: 'Sheet1',
          cell: 'B7',
          comment: '项目名称留空',
        },
      ]),
    )

    const normalized = normalizeExcelReviewIssues(issues, {
      userRequest: '审查错误并生成修订版',
      snapshot,
    })

    expect(normalized[0]?.sheet).toBe('Invoice')
    expect(normalized[0]?.cell).toBe('A7')
  })

  it('routes amount-in-words issue from numeric cell to words row', () => {
    const { issues } = parseExcelReviewIssues(
      JSON.stringify([
        {
          id: '1',
          action: 'highlight',
          severity: 'medium',
          category: 'error',
          sheet: 'Invoice',
          cell: 'H22',
          comment:
            'Total overdue interest 为 1,168.49 USD，请务必将大写金额修正为 $1,168.49 的文字描述',
        },
      ]),
    )

    const normalized = normalizeExcelReviewIssues(issues, {
      userRequest: '审查错误并生成修订版',
      snapshot,
    })

    expect(normalized[0]?.action).toBe('modify')
    expect(normalized[0]?.cell).toBe('A26')
    expect(normalized[0]?.value).toBe(
      'NET PAYABLE AMOUNT IN WORDS:\nSAY U.S. DOLLARS ONE THOUSAND ONE HUNDRED SIXTY-EIGHT AND FORTY-NINE CENTS ONLY.',
    )
  })

  it('coerces amount-in-words highlight to modify with generated value', () => {
    const { issues } = parseExcelReviewIssues(
      JSON.stringify([
        {
          id: '1',
          action: 'highlight',
          severity: 'medium',
          category: 'error',
          sheet: 'Invoice',
          cell: 'H23',
          comment:
            'Total overdue interest 为 1,168.49 USD，请务必将大写金额修正为 $1,168.49 的文字描述',
        },
      ]),
    )

    const normalized = normalizeExcelReviewIssues(issues, {
      userRequest: '审查错误并生成修订版',
      snapshot,
    })

    expect(normalized[0]?.action).toBe('modify')
    expect(normalized[0]?.cell).toBe('A26')
    expect(normalized[0]?.value).toBe(
      'NET PAYABLE AMOUNT IN WORDS:\nSAY U.S. DOLLARS ONE THOUSAND ONE HUNDRED SIXTY-EIGHT AND FORTY-NINE CENTS ONLY.',
    )
  })
})

describe('requestsExcelDirectFix', () => {
  it('detects fix intent from default review request', () => {
    expect(requestsExcelDirectFix('')).toBe(true)
    expect(requestsExcelDirectFix('只读检查，不要改文件')).toBe(false)
  })
})
