import { describe, expect, it } from 'vitest'
import { isTranslationPageSourceInsufficient } from './translation-page-source-quality'

describe('isTranslationPageSourceInsufficient', () => {
  it('rejects empty text', () => {
    expect(isTranslationPageSourceInsufficient('')).toBe(true)
  })

  it('accepts a short but valid header sentence', () => {
    expect(isTranslationPageSourceInsufficient('Click Download to see negotiation minutes.')).toBe(
      false,
    )
  })

  it('accepts normal contract text', () => {
    expect(
      isTranslationPageSourceInsufficient(
        'Click Download to see negotiation minutes. The Employer and Contractor agreed that all powers of attorney submitted with the bid remain valid for the purposes of this contract and subsequent negotiations between the parties.',
      ),
    ).toBe(false)
  })

  it('rejects repeated numeric OCR noise', () => {
    expect(
      isTranslationPageSourceInsufficient(
        Array.from({ length: 20 }, () => '27').join('\n'),
      ),
    ).toBe(true)
  })

  it('rejects mostly digits with almost no letters', () => {
    expect(isTranslationPageSourceInsufficient('27 8 27 27 27 27 27 27')).toBe(true)
  })
})
