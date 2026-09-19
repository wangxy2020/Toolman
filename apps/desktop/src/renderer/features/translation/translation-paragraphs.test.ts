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

  it('keeps single-newline lists in one paragraph', () => {
    expect(splitTranslationDisplayParagraphs('标题\na) 第一条\nb) 第二条')).toEqual([
      '标题\na) 第一条\nb) 第二条',
    ])
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
})

describe('reflowTranslationDisplayLines', () => {
  it('keeps letter-head lines on their own rows', () => {
    expect(
      reflowTranslationDisplayLines(
        ['TBEA', 'No. 23, Chang\'an Road', '8th Sept 2026', 'Dear Sir,'].join('\n'),
      ),
    ).toBe(['TBEA', "No. 23, Chang'an Road", '8th Sept 2026', 'Dear Sir,'].join('\n'))
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
})
