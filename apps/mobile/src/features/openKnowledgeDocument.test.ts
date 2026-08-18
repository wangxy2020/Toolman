import { describe, expect, it } from 'vitest'
import {
  knowledgeFileMime,
  knowledgeFileUnavailableMessage,
  knowledgeOpenUrl,
} from './openKnowledgeDocument-utils'
import type { KnowledgeFileItem } from './knowledgeSidebar'

describe('openKnowledgeDocument helpers', () => {
  it('prefers a real mime type over octet-stream', () => {
    expect(knowledgeFileMime('notes.pdf', 'application/octet-stream')).toBe('application/pdf')
    expect(knowledgeFileMime('notes.pdf', 'application/pdf')).toBe('application/pdf')
    expect(knowledgeFileMime('sheet.xlsx')).toContain('spreadsheet')
  })

  it('opens http(s) knowledge sources as URLs', () => {
    const doc: KnowledgeFileItem = {
      id: '1',
      title: 'https://example.com/a',
      sizeLabel: 'URL',
      addedAt: 1,
      status: 'ready',
      sourceKind: 'url',
      absolutePath: 'https://example.com/a',
    }
    expect(knowledgeOpenUrl(doc)).toBe('https://example.com/a')
    expect(
      knowledgeOpenUrl({
        ...doc,
        sourceKind: 'file',
        absolutePath: undefined,
        title: 'local.pdf',
      }),
    ).toBeNull()
  })

  it('only blocks files the desktop no longer has', () => {
    expect(knowledgeFileUnavailableMessage(undefined)).toBeNull()
    expect(
      knowledgeFileUnavailableMessage({
        documentId: '1',
        kbId: 'kb',
        fileName: 'a.pdf',
        sizeBytes: 10,
        omitReason: 'missing',
      }),
    ).toMatch(/没有/)
    expect(
      knowledgeFileUnavailableMessage({
        documentId: '1',
        kbId: 'kb',
        fileName: 'a.pdf',
        sizeBytes: 40 * 1024 * 1024,
        omitReason: 'too_large',
      }),
    ).toBeNull()
  })
})
