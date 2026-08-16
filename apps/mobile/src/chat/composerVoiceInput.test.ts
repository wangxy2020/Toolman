import { describe, expect, it } from 'vitest'
import {
  appendVoiceTranscript,
  canUseComposerVoiceInput,
  speechRecognitionLocale,
} from './composerVoiceInput'

describe('composerVoiceInput', () => {
  it('appends recognized speech without losing existing text', () => {
    expect(appendVoiceTranscript('', '你好')).toBe('你好')
    expect(appendVoiceTranscript('已有内容', '继续')).toBe('已有内容 继续')
    expect(appendVoiceTranscript('已有内容  ', '  ')).toBe('已有内容  ')
  })

  it('maps app language to a recognizer locale', () => {
    expect(speechRecognitionLocale('en')).toBe('en-US')
    expect(speechRecognitionLocale('zh-CN')).toBe('zh-CN')
  })

  it('is unavailable without a browser SpeechRecognition API', () => {
    expect(canUseComposerVoiceInput()).toBe(false)
  })
})
