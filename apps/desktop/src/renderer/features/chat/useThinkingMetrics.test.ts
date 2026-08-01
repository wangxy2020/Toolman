import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@toolman/shared'
import { applyStreamDelta } from './apply-stream-delta'

describe('applyStreamDelta thinking timing meta', () => {
  it('preserves startedAtMs and applies durationSeconds from main', () => {
    let blocks: ContentBlock[] = []
    blocks = applyStreamDelta(blocks, {
      type: 'thinking',
      text: 'a',
      startedAtMs: 1_000,
    })
    blocks = applyStreamDelta(blocks, {
      type: 'thinking',
      text: 'b',
      startedAtMs: 1_000,
    })
    expect(blocks[0]).toMatchObject({
      type: 'thinking',
      text: 'ab',
      startedAtMs: 1_000,
    })

    blocks = applyStreamDelta(blocks, {
      type: 'thinking',
      text: '',
      durationSeconds: 12,
      startedAtMs: 1_000,
    })
    expect(blocks[0]).toMatchObject({
      type: 'thinking',
      text: 'ab',
      durationSeconds: 12,
      startedAtMs: 1_000,
    })
  })

  it('keeps prior startedAtMs when a later delta omits it', () => {
    let blocks: ContentBlock[] = applyStreamDelta([], {
      type: 'thinking',
      text: 'hello',
      startedAtMs: 42,
    })
    blocks = applyStreamDelta(blocks, {
      type: 'thinking',
      text: ' world',
    })
    expect(blocks[0]).toMatchObject({
      type: 'thinking',
      text: 'hello world',
      startedAtMs: 42,
    })
  })

  it('keeps the earliest startedAtMs and the longest durationSeconds', () => {
    let blocks: ContentBlock[] = applyStreamDelta([], {
      type: 'thinking',
      text: 'a',
      startedAtMs: 1_000,
      durationSeconds: 63,
    })
    blocks = applyStreamDelta(blocks, {
      type: 'thinking',
      text: 'b',
      startedAtMs: 50_000,
      durationSeconds: 10,
    })
    expect(blocks[0]).toMatchObject({
      type: 'thinking',
      text: 'ab',
      startedAtMs: 1_000,
      durationSeconds: 63,
    })
  })
})
