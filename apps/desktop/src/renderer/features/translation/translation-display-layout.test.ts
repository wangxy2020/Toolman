import { describe, expect, it } from 'vitest'
import { reconstructTranslationTable } from './translation-display-table'
import { buildTranslationDisplayBlocks } from './translation-display-blocks'
import {
  reflowTranslationDisplayLines,
  splitTranslationDisplayParagraphs,
} from './translation-paragraphs'

const CLAIM_TABLE_PAGE = [
  '1. 索赔明细',
  '所有金额均为坦桑尼亚先令（TZS），不含增值税。（索赔项目|原始发票金额（TZS）|索赔依据|索赔金额（TZS））：车辆装卸费（停留时间）|33,800,000.00|根据11天发票累计计算的费用：发票7天，包括2026年7月15日至7月21日。|21,509,090.91|空拖车运往布科巴|36,400,000.00|全部索赔。|36,400,000.00|空拖车返回达累斯萨拉姆|29,900,000.00|因更换车辆产生的额外装卸的50%索赔。|14,950,000.00|装载设备运输费：2个半挂车多次往返|8,200,000.00|与额外装卸有关的设备运输的50%索赔。|4,100,000.00|护送车辆-从达累斯萨拉姆到布科巴|3,900,000.00|全部索赔。|3,900,000.00|不含增值税合计索赔金额|122,259,090.91',
].join('\n')

describe('translation display layout', () => {
  it('starts We-refer / 我方提及 as its own paragraph after 主题', () => {
    const glued =
      '主题：关于 400 kV 输电线路的验收证书申请通知及剩余停电依赖性工程的停电安排请求我方提及上述项目以及合同的相关条款，包括有关工程和分段验收的 GCC 条款 10.1。'
    const parts = splitTranslationDisplayParagraphs(glued)
    expect(parts.length).toBeGreaterThanOrEqual(2)
    expect(parts[0]).toMatch(/^主题：/)
    expect(parts[0]).not.toContain('我方提及')
    expect(parts.some((part) => part.startsWith('我方提及'))).toBe(true)
  })

  it('does not join an unindented We refer line into the Subject line', () => {
    const text = [
      'Subject: Notice of Application for Taking-Over Certificate',
      'We refer to the above mentioned Project and the relevant provisions of the Contract.',
    ].join('\n')
    expect(reflowTranslationDisplayLines(text)).toContain('\nWe refer to the above')
    const parts = splitTranslationDisplayParagraphs(text)
    expect(parts.some((part) => part.startsWith('We refer'))).toBe(true)
  })

  it('keeps wrapped CJK sentences in one paragraph', () => {
    expect(
      splitTranslationDisplayParagraphs(
        '我方提及上述项目，并希望贵方注意以下\n事项。我们正在等待相关文件以便完成\n本次移交工作。',
      ),
    ).toEqual(['我方提及上述项目，并希望贵方注意以下事项。我们正在等待相关文件以便完成本次移交工作。'])
  })

  it('splits letterhead from 因此 so the body is not mixed into the address', () => {
    const glued =
      '中国新疆昌吉市南路189号\n手机：+255 758 599 766 / +86 1510316224|邮件：lanhe1002@163.com; liushangcheng@tbea.com因此，我们请求TANESCO审核并确认此项索赔。'
    const parts = splitTranslationDisplayParagraphs(glued)
    expect(parts.some((part) => part.startsWith('因此，我们请求'))).toBe(true)
    expect(parts.find((part) => part.includes('@tbea.com')) ?? '').not.toContain('因此，我们请求')
  })

  it('rebuilds a claim table from parenthetical pipe headers', () => {
    const table = reconstructTranslationTable(CLAIM_TABLE_PAGE)
    expect(table).not.toBeNull()
    expect(table?.headers).toEqual([
      '索赔项目',
      '原始发票金额（TZS）',
      '索赔依据',
      '索赔金额（TZS）',
    ])
    expect(table?.rows[0]?.[0]).toBe('车辆装卸费（停留时间）')
    expect(table?.rows[0]?.[1]).toBe('33,800,000.00')
    expect(table?.rows.some((row) => row[0]?.includes('合计'))).toBe(true)
    const total = table?.rows.find((row) => row[0]?.includes('合计'))
    expect(total?.[total.length - 1]).toBe('122,259,090.91')
  })

  it('renders heading, note, and table as separate display blocks', () => {
    const blocks = buildTranslationDisplayBlocks(CLAIM_TABLE_PAGE)
    expect(blocks.some((block) => block.type === 'heading' && block.text.includes('索赔明细'))).toBe(
      true,
    )
    expect(blocks.some((block) => block.type === 'paragraph' && block.text.includes('所有金额均为'))).toBe(
      true,
    )
    const table = blocks.find((block) => block.type === 'table')
    expect(table?.type === 'table' && table.rows.length >= 6).toBe(true)
  })

  it('does not treat a contact line with one pipe as a table', () => {
    expect(
      reconstructTranslationTable(
        '手机：+255 758 599 766 / +86 1510316224|邮件：lanhe1002@163.com',
      ),
    ).toBeNull()
  })
})
