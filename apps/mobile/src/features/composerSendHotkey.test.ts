import { describe, expect, it } from 'vitest'
import { isWebComposerSendHotkey, webComposerSendPlaceholder } from './composerSendHotkey'

describe('isWebComposerSendHotkey', () => {
  it('sends with ⌘Enter on Mac', () => {
    expect(isWebComposerSendHotkey({ key: 'Enter', metaKey: true }, true)).toBe(true)
    expect(isWebComposerSendHotkey({ key: 'Enter' }, true)).toBe(false)
    expect(isWebComposerSendHotkey({ key: 'Enter', altKey: true }, true)).toBe(false)
    expect(isWebComposerSendHotkey({ key: 'Enter', shiftKey: true, metaKey: true }, true)).toBe(false)
  })

  it('sends with Alt+Enter or Ctrl+Enter on Windows', () => {
    expect(isWebComposerSendHotkey({ key: 'Enter', altKey: true }, false)).toBe(true)
    expect(isWebComposerSendHotkey({ key: 'Enter', ctrlKey: true }, false)).toBe(true)
    expect(isWebComposerSendHotkey({ key: 'Enter' }, false)).toBe(false)
    expect(isWebComposerSendHotkey({ key: 'Enter', metaKey: true }, false)).toBe(false)
  })

  it('describes the shortcut in the placeholder', () => {
    expect(webComposerSendPlaceholder(false)).toMatch(/发送/)
    expect(webComposerSendPlaceholder(true)).toMatch(/换行/)
  })
})
