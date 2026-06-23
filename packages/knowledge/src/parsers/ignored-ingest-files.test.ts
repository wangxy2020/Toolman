import { describe, expect, it } from 'vitest'
import { isIgnoredKnowledgeIngestFile } from './file-type.js'

describe('isIgnoredKnowledgeIngestFile', () => {
  it('ignores macOS Finder metadata files', () => {
    expect(isIgnoredKnowledgeIngestFile('/data/共享知识库/测试群/.DS_Store')).toBe(true)
    expect(isIgnoredKnowledgeIngestFile('/data/.localized')).toBe(true)
  })

  it('ignores Windows folder metadata files', () => {
    expect(isIgnoredKnowledgeIngestFile('/docs/Thumbs.db')).toBe(true)
    expect(isIgnoredKnowledgeIngestFile('/docs/desktop.ini')).toBe(true)
  })

  it('ignores Office lock files', () => {
    expect(isIgnoredKnowledgeIngestFile('/docs/~$报告.docx')).toBe(true)
    expect(isIgnoredKnowledgeIngestFile('/docs/._report.xlsx')).toBe(true)
  })

  it('allows normal knowledge files', () => {
    expect(isIgnoredKnowledgeIngestFile('/docs/notes.md')).toBe(false)
    expect(isIgnoredKnowledgeIngestFile('/docs/report.pdf')).toBe(false)
  })
})
