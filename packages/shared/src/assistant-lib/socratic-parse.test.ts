import { describe, expect, it } from 'vitest'
import { parseThoughtChainCard, stripSocraticMachineBlocks } from './socratic-parse'

describe('stripSocraticMachineBlocks', () => {
  it('removes completed card and state fences', () => {
    const text = [
      '你再想想：冲突从哪里来？',
      '',
      '```socratic-card',
      'confirmed: 冲突需要对立目标',
      'assumption: 读者只关心主角',
      '```',
      '```socratic-state',
      '{"mastered":[],"misconceptions":[],"stuckPoints":[],"confirmedClaims":[],"openAssumptions":[],"pathIndex":0,"pathNodes":[]}',
      '```',
    ].join('\n')

    expect(stripSocraticMachineBlocks(text)).toBe('你再想想：冲突从哪里来？')
  })

  it('drops an incomplete trailing fence while streaming', () => {
    const text = '先确认主题。\n\n```socratic-card\nconfirmed: 还在写'
    expect(stripSocraticMachineBlocks(text)).toBe('先确认主题。')
  })
})

describe('parseThoughtChainCard', () => {
  it('still parses card from raw text', () => {
    const card = parseThoughtChainCard(
      '正文\n```socratic-card\nconfirmed: A\nassumption: B\n```',
    )
    expect(card).toEqual({ confirmed: 'A', assumption: 'B' })
  })
})
