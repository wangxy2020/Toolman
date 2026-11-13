import { describe, expect, it } from 'vitest'
import {
  reflowTranslationDisplayLines,
  splitContrastParagraphs,
  splitTranslationDisplayParagraphs,
  withHtmlTextLineBreaks,
  withMarkdownHardLineBreaks,
} from './translation-paragraphs'

describe('splitTranslationDisplayParagraphs', () => {
  it('collapses triple newlines and splits on a paragraph gap', () => {
    expect(splitTranslationDisplayParagraphs('A\n\n\n\nB')).toEqual(['A', 'B'])
  })

  it('splits lettered list items into their own paragraphs', () => {
    const parts = splitTranslationDisplayParagraphs('标题\na) 第一条\nb) 第二条')
    expect(parts[0]).toBe('标题')
    expect(parts.some((part) => part.startsWith('a)'))).toBe(true)
    expect(parts.some((part) => part.startsWith('b)'))).toBe(true)
  })

  it('reflows wrapped body lines so the paragraph can fill the page width', () => {
    expect(
      splitTranslationDisplayParagraphs(
        '我方提及上述项目，并希望贵方注意以下\n事项。我们正在等待相关文件以便完成\n本次移交工作。',
      ),
    ).toEqual(['我方提及上述项目，并希望贵方注意以下事项。我们正在等待相关文件以便完成本次移交工作。'])
  })

  it('starts 我方提及 on its own paragraph after a glued 主题 line', () => {
    const parts = splitTranslationDisplayParagraphs(
      '主题：关于 400 kV 输电线路的验收证书申请通知及剩余停电依赖性工程的停电安排请求我方提及上述项目以及合同的相关条款。',
    )
    expect(parts[0]).toMatch(/^主题：/)
    expect(parts[0]).not.toContain('我方提及')
    expect(parts.some((part) => part.startsWith('我方提及'))).toBe(true)
  })

  it('does not mash capital-start English paragraphs when periods are missing', () => {
    const parts = splitTranslationDisplayParagraphs(
      [
        'The Employer will obtain the tax exemption certificates for the Contractor',
        'Payment will be made according to the agreed milestone schedule',
        'Work schedules for the contract period will be finalized later',
      ].join('\n'),
    )
    expect(parts.length).toBeGreaterThanOrEqual(3)
  })

  it('does not mash long CJK paragraphs when sentence punctuation is missing', () => {
    const parts = splitTranslationDisplayParagraphs(
      [
        '雇主将为承包商取得免税证明并配合办理相关手续',
        '付款将按照双方同意的里程碑计划执行并及时结算',
        '合同期内的施工进度计划将在后续会议中最终确认',
      ].join('\n'),
    )
    expect(parts.length).toBeGreaterThanOrEqual(2)
  })

  it('does not treat date or quantity wraps as list headings', () => {
    const parts = splitTranslationDisplayParagraphs(
      [
        'The meeting was held on',
        '5 September 2026 by the parties present.',
        'The contractor shall supply',
        '10 copies of the drawings to the engineer.',
      ].join('\n'),
    )
    expect(parts.some((part) => /^5 September/.test(part))).toBe(false)
    expect(parts.some((part) => /^10 copies/.test(part))).toBe(false)
    expect(parts.join(' ')).toContain('5 September 2026')
    expect(parts.join(' ')).toContain('10 copies of the drawings')
  })

  it('splits roman-numeral negotiation items into separate paragraphs', () => {
    const parts = splitTranslationDisplayParagraphs(
      [
        '3 DISCUSSION ON ISSUES OF NEGOTIATION',
        'i. Power of Attorney: It was agreed that POA is provided.',
        'ii. Performance Security: It was agreed that performance security will be issued.',
        'iii. Environmental and Social Security: It was agreed that the ES security shall be issued.',
        'iv. Sub-contractor: It was confirmed that local sub-contractors may be used.',
      ].join('\n'),
    )
    expect(parts.length).toBeGreaterThanOrEqual(4)
    expect(parts.some((part) => /^i\./i.test(part))).toBe(true)
    expect(parts.some((part) => /^ii\./i.test(part))).toBe(true)
    expect(parts.some((part) => /^iii\./i.test(part))).toBe(true)
    expect(parts.some((part) => /^iv\./i.test(part))).toBe(true)
  })

  it('unpacks glued roman-numeral items from a single OCR line', () => {
    const parts = splitTranslationDisplayParagraphs(
      '1 Power of Attorney: It was agreed that POA is provided to present the company. ii Performance Security: It was agreed that performance security will be issued. iii Environmental and Social Security: It was agreed that the ES security shall be issued.',
    )
    expect(parts.length).toBeGreaterThanOrEqual(3)
    expect(parts.some((part) => /\bii\b/i.test(part) && /Performance Security/i.test(part))).toBe(
      true,
    )
    expect(parts.some((part) => /\biii\b/i.test(part) && /Environmental/i.test(part))).toBe(true)
  })
})

describe('reflowTranslationDisplayLines', () => {
  it('keeps letter-head lines on their own rows', () => {
    expect(
      reflowTranslationDisplayLines(
        ['TBEA', 'No. 23, Chang\'an Road', '8th Sept 2026', 'Dear Sir,'].join('\n'),
      ),
    ).toBe(['TBEA', "No. 23, Chang'an Road", '8th Sept 2026', 'Dear Sir,'].join('\n'))
  })

  it('merges ODL one-token-per-line title pages into readable prose', () => {
    const fragmented = [
      '■',
      'EPC/TURNKEY',
      'FORM',
      'OF',
      'AGREEMENT',
      'FOR',
      'THE',
      'AWARD',
      'OF',
      'EPC',
      '/',
      'TURNKEY',
      'PROJECTS',
      'PROJECT:',
      'THE',
      'KABANGA',
      'NICKEL',
      'PROJECT',
      'LOCATED',
      'IN',
      'THE',
      'NGARA',
      'DISTRICT',
      'EMPLOYER:',
      'TEMBO',
      'NICKEL',
      'CORPORATION',
      'LIMITED',
    ].join('\n')
    const reflowed = reflowTranslationDisplayLines(fragmented)
    expect(reflowed).toContain('EPC/TURNKEY FORM OF AGREEMENT')
    expect(reflowed).toContain('PROJECT: THE KABANGA NICKEL PROJECT')
    expect(reflowed).toContain('EMPLOYER: TEMBO NICKEL CORPORATION LIMITED')
    expect(reflowed.split('\n').length).toBeLessThan(10)
    expect(reflowed).not.toMatch(/^■/m)
  })
})

describe('withMarkdownHardLineBreaks', () => {
  it('keeps letter-head lines from collapsing into one paragraph', () => {
    expect(
      withMarkdownHardLineBreaks(
        ['TBEA', 'No. 23, Chang\'an Road', '8th Sept 2026', '', 'Dear Sir,'].join('\n'),
      ),
    ).toBe(['TBEA  ', "No. 23, Chang'an Road  ", '8th Sept 2026', '', 'Dear Sir,'].join('\n'))
  })

  it('leaves a single paragraph break, not stacked blank lines', () => {
    expect(withMarkdownHardLineBreaks('合同形式\n\n\n正文段落')).toBe('合同形式\n\n正文段落')
  })
})

describe('splitContrastParagraphs', () => {
  it('splits wrapped English letter paragraphs instead of keeping the whole page as one block', () => {
    const source = [
      'We refer to your Letter Ref. TBEA/TTGRUP/LOT1/2026076',
      'dated 8 September 2026 regarding your request for',
      'additional installation items and corresponding',
      'adjustment of the Contract Price for certain equipment at',
      'Same and Bukoba Substations.',
      'The Consultant has reviewed your submission and the',
      'contractual basis stated therein.',
      'Your submission identifies the following installation',
      'activities for which you state that no separate installation',
      'items are provided under Schedule No. 4:',
    ].join('\n')
    const parts = splitContrastParagraphs(source)
    expect(parts.length).toBeGreaterThanOrEqual(3)
    expect(parts[0]).toContain('We refer to your Letter')
    expect(parts[0]).toContain('Bukoba Substations.')
    expect(parts.some((part) => part.startsWith('The Consultant has reviewed'))).toBe(true)
    expect(parts.some((part) => part.startsWith('Your submission identifies'))).toBe(true)
  })

  it('keeps Chinese body sentences from being glued across a period + new paragraph', () => {
    const parts = splitContrastParagraphs(
      '我们参考了您于2026年9月8日发出的事由函件。\n顾问已审阅了您的提交材料以及其中所述的合同依据。',
    )
    expect(parts.length).toBeGreaterThanOrEqual(2)
    expect(parts[0]).toContain('事由函件')
    expect(parts.some((part) => part.startsWith('顾问已审阅'))).toBe(true)
  })
})

describe('withHtmlTextLineBreaks', () => {
  it('turns newlines inside a paragraph into <br>', () => {
    expect(withHtmlTextLineBreaks('<p>TBEA\nNo. 23\n8th Sept 2026</p>')).toBe(
      '<p>TBEA<br>No. 23<br>8th Sept 2026</p>',
    )
  })

  it('drops empty paragraphs, leading/trailing <br>, and stacked <br>', () => {
    expect(withHtmlTextLineBreaks('<p><br>A<br></p><p><br></p><p>B<br><br>C</p>')).toBe(
      '<p>A</p><p>B<br>C</p>',
    )
  })

  it('collapses OCR newlines inside table cells instead of stacking <br>', () => {
    const html =
      '<table><tr><th>Item</th><th>Entry</th></tr>' +
      '<tr><td>Name</td><td>Tembo\nNickel\nProject</td></tr></table>'
    const next = withHtmlTextLineBreaks(html)
    expect(next).toContain('<td>Tembo Nickel Project</td>')
    expect(next).not.toContain('<br>')
  })

  it('still hard-breaks letter-head prose outside tables', () => {
    const html =
      '<p>TBEA\nNo. 23</p><table><tr><td>A\nB</td></tr></table><p>8th Sept 2026\nDear Sir</p>'
    const next = withHtmlTextLineBreaks(html)
    expect(next).toContain('<p>TBEA<br>No. 23</p>')
    expect(next).toContain('<td>A B</td>')
    expect(next).toContain('<p>8th Sept 2026<br>Dear Sir</p>')
  })
})
