import { describe, expect, it } from 'vitest'
import { sanitizeSpeakableText } from './sanitizeSpeakableText'

describe('sanitizeSpeakableText', () => {
  it('strips markdown list and bold markers', () => {
    const text = sanitizeSpeakableText('- **对话交流**：这是说明。')
    expect(text).not.toContain('**')
    expect(text).not.toMatch(/^-/)
    expect(text).toContain('对话交流')
    expect(text).toContain('这是说明')
    expect(text).not.toContain('：')
  })

  it('keeps math and chemistry formula characters', () => {
    const text = sanitizeSpeakableText('反应式：H2O + CO2 → C6H12O6，温度 25°C，比值 1:2。')
    expect(text).toContain('H2O')
    expect(text).toContain('CO2')
    expect(text).toContain('+')
    expect(text).toContain('→')
    expect(text).toContain('25°C')
    expect(text).toContain('1:2')
  })

  it('drops emoji and decorative icons', () => {
    const text = sanitizeSpeakableText('你好 😊 世界 ✅ 继续')
    expect(text).toBe('你好 世界 继续')
  })

  it('drops fenced code blocks', () => {
    const text = sanitizeSpeakableText('见文档\n```ts\nconst a=1\n```\n结束。')
    expect(text).not.toContain('const')
    expect(text).toContain('见文档')
    expect(text).toContain('结束')
  })
})
