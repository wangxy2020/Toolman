import { describe, expect, it } from 'vitest'

import {
  EPC_COMMERCIAL_DEFAULT_QUICK_PHRASE_ID,
  EPC_COMMERCIAL_QUICK_PHRASE_CONTENT,
  EPC_COMMERCIAL_QUICK_PHRASE_CONTENT_REVISION,
  EPC_COMMERCIAL_QUICK_PHRASE_TITLE
} from '../epcCommercialQuickPhrase.js'

/**
 * 锁定内置快捷短语文案。若产品确认要改显示内容，请同时更新 epcCommercialQuickPhrase.ts 并递增 REVISION。
 */
describe('epcCommercialQuickPhrase (locked copy)', () => {
  it('keeps stable phrase id and title', () => {
    expect(EPC_COMMERCIAL_DEFAULT_QUICK_PHRASE_ID).toBe('epc-work4-quantity-payment-stats')
    expect(EPC_COMMERCIAL_QUICK_PHRASE_TITLE).toBe('进度款工程量数据统计')
  })

  it('locks user-visible quick phrase content', () => {
    expect(EPC_COMMERCIAL_QUICK_PHRASE_CONTENT).toBe(
      '请对当前工作区中，各文件夹内的工程量清单与进度款数据进行分析和统计。分析工程量清单中前期、本期完成的工程数量，累计已完成工程数量，已完成百分比，完成金额，本期完成金额等有无错误。将本期完成的工程量金额作为一列，统计到合同价格表中。'
    )
  })

  it('requires explicit revision bump when content changes', () => {
    expect(EPC_COMMERCIAL_QUICK_PHRASE_CONTENT_REVISION).toBe(3)
  })
})
