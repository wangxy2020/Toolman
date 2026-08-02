import { describe, expect, it } from 'vitest'
import {
  readComposerText,
  shouldIgnoreComposerInput,
  shouldSubmitOnEnter,
} from './message-input-utils'
import type { KeyboardEvent } from 'react'

function keyEvent(partial: {
  key: string
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  isComposing?: boolean
  keyCode?: number
}): KeyboardEvent<HTMLTextAreaElement> {
  return {
    key: partial.key,
    shiftKey: partial.shiftKey ?? false,
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    keyCode: partial.keyCode ?? 0,
    nativeEvent: { isComposing: partial.isComposing ?? false },
  } as KeyboardEvent<HTMLTextAreaElement>
}

describe('shouldSubmitOnEnter', () => {
  it('blocks submit while IME/dictation is composing', () => {
    expect(
      shouldSubmitOnEnter(keyEvent({ key: 'Enter', isComposing: true }), 'enter'),
    ).toBe(false)
    expect(shouldSubmitOnEnter(keyEvent({ key: 'Enter', keyCode: 229 }), 'enter')).toBe(false)
  })

  it('allows plain Enter when not composing', () => {
    expect(shouldSubmitOnEnter(keyEvent({ key: 'Enter' }), 'enter')).toBe(true)
  })
})

describe('readComposerText', () => {
  it('prefers the live textarea value', () => {
    const textarea = { value: '听写结果' } as HTMLTextAreaElement
    expect(readComposerText(textarea, '旧状态')).toBe('听写结果')
    expect(readComposerText(null, '旧状态')).toBe('旧状态')
  })
})

describe('shouldIgnoreComposerInput', () => {
  it('suppresses input until the deadline', () => {
    expect(shouldIgnoreComposerInput(1_000, 900)).toBe(true)
    expect(shouldIgnoreComposerInput(1_000, 1_000)).toBe(false)
  })
})
