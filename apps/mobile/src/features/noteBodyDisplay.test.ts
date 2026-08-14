import { describe, expect, it } from 'vitest'
import { extractNoteOutline, prepareNoteMarkdown } from './noteBodyDisplay'

describe('prepareNoteMarkdown', () => {
  it('drops socratic machine fences', () => {
    const text = [
      '你再想想：冲突从哪里来？',
      '',
      '```socratic-card',
      'confirmed: 主题',
      'assumption: 无',
      '```',
    ].join('\n')
    expect(prepareNoteMarkdown(text)).toBe('你再想想：冲突从哪里来？')
  })

  it('unwraps underline and font-size editor tags', () => {
    expect(prepareNoteMarkdown('见<u>重点</u>')).toBe('见重点')
    expect(prepareNoteMarkdown('<span style="font-size: 18px">大标题</span>')).toBe('大标题')
  })

  it('extracts markdown headings for the outline', () => {
    expect(
      extractNoteOutline('# 一\n正文\n## 二\n### 三\n#### 四级不收录'),
    ).toEqual([
      { id: 'h-0', level: 1, text: '一' },
      { id: 'h-2', level: 2, text: '二' },
      { id: 'h-3', level: 3, text: '三' },
    ])
  })
})
