import { describe, expect, it } from 'vitest'
import { prepareSpokenSentence } from './prepare-spoken-sentence'

describe('prepareSpokenSentence', () => {
  it('reads ions and salts as Chinese chemical names', () => {
    const spoken = prepareSpokenSentence('Ba²⁺ 和 SO₄²⁻ 结合成 BaSO₄，溶液里还有 BaCl₂。')
    expect(spoken).toContain('钡离子')
    expect(spoken).toContain('硫酸根离子')
    expect(spoken).toContain('硫酸钡')
    expect(spoken).toContain('氯化钡')
    expect(spoken).not.toMatch(/Ba|SO₄|²|⁺|⁻/)
  })

  it('reads formulas that have no subscript', () => {
    expect(prepareSpokenSentence('CaO 和 Fe 都要读出名称。')).toBe('氧化钙 和 铁 都要读出名称。')
    expect(prepareSpokenSentence('NaCl 与 NaOH 反应。')).toBe('氯化钠 与 氢氧化钠 反应。')
    expect(prepareSpokenSentence('CO 是还原剂。')).toBe('一氧化碳 是还原剂。')
    expect(prepareSpokenSentence('溶液里有 Na 和 Cl。')).toBe('溶液里有 钠 和 氯。')
  })

  it('reads common textbook formulas', () => {
    expect(prepareSpokenSentence('Na₂SO₄ 与 CaCO₃ 反应生成 CO₂。')).toBe(
      '硫酸钠 与 碳酸钙 反应生成 二氧化碳。',
    )
    expect(prepareSpokenSentence('铁原子变成 Fe²⁺ 或 Fe³⁺。')).toBe(
      '铁原子变成 亚铁离子 或 铁离子。',
    )
  })

  it('drops a trailing English sentence', () => {
    expect(
      prepareSpokenSentence('它还算不算化学变化？ No electron transfer occurs in this step.'),
    ).toBe('它还算不算化学变化？')
    expect(prepareSpokenSentence('The barium ion forms a white precipitate.')).toBe('')
  })

  it('drops machine-only English labels', () => {
    expect(prepareSpokenSentence('confirmed: 学生把电子转移当成唯一标准')).toBe('')
    expect(prepareSpokenSentence('{"chapterPassed":false}')).toBe('')
  })
})
