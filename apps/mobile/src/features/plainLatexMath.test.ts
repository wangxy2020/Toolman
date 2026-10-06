import { describe, expect, it } from 'vitest'
import { replaceLatexMath } from './plainLatexMath'

describe('replaceLatexMath', () => {
  it('turns classroom chemistry prompts into readable formulas', () => {
    const source = [
      '1. 写出 $\\text{Fe} + \\text{CuSO}_4 \\rightarrow$ 的反应式，并判断它属于离子反应还是氧化还原反应（或两者都是），说明你的证据；',
      '2. 已知某 $\\text{Na}$ 相关溶液的体积和浓度、却没有直接给出方程式时，你怎样通过物质的量关系去求生成物的质量——说清你的解题思路；',
    ].join('\n')
    expect(replaceLatexMath(source)).toBe(
      [
        '1. 写出 Fe + CuSO₄ → 的反应式，并判断它属于离子反应还是氧化还原反应（或两者都是），说明你的证据；',
        '2. 已知某 Na 相关溶液的体积和浓度、却没有直接给出方程式时，你怎样通过物质的量关系去求生成物的质量——说清你的解题思路；',
      ].join('\n'),
    )
  })

  it('keeps ordinary dollar amounts', () => {
    expect(replaceLatexMath('费用是 $5 和 $12.5')).toBe('费用是 $5 和 $12.5')
  })

  it('reads ionic charges', () => {
    expect(replaceLatexMath('$\\mathrm{Fe}^{2+} + \\mathrm{SO}_4^{2-}$')).toBe('Fe²⁺ + SO₄²⁻')
  })
})