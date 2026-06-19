import { describe, expect, it } from 'vitest'
import {
  getSystemVoiceInputHint,
  getSystemVoiceInputTitle,
} from './system-voice-input'

describe('getSystemVoiceInputHint', () => {
  it('returns platform-specific guidance', () => {
    expect(getSystemVoiceInputHint('darwin')).toContain('Fn')
    expect(getSystemVoiceInputHint('win32')).toContain('Win + H')
    expect(getSystemVoiceInputHint('linux')).toContain('输入法')
  })
})

describe('getSystemVoiceInputTitle', () => {
  it('returns short action labels', () => {
    expect(getSystemVoiceInputTitle('darwin')).toContain('听写')
    expect(getSystemVoiceInputTitle('win32')).toContain('Win + H')
  })
})
