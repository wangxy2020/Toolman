import { describe, expect, it } from 'vitest'
import {
  applySavedPageSnapshots,
  buildDocumentPageSnapshots,
} from './document-page-snapshots'
import type { DocumentPageState } from './useDocumentPageTranslation'

describe('document-page-snapshots', () => {
  it('builds snapshots for parsed and translated pages', () => {
    const pages: DocumentPageState[] = [
      {
        pageNumber: 1,
        sourceText: 'hello',
        translatedText: '# Title',
        parsedMarkdown: '# Title',
        status: 'parsed',
      },
      {
        pageNumber: 2,
        sourceText: 'world',
        translatedText: '世界',
        status: 'done',
      },
      {
        pageNumber: 3,
        sourceText: '',
        translatedText: '',
        status: 'idle',
      },
    ]

    expect(buildDocumentPageSnapshots(pages)).toEqual([
      {
        pageNumber: 1,
        sourceText: 'hello',
        translatedText: '# Title',
        parsedMarkdown: '# Title',
        status: 'parsed',
      },
      {
        pageNumber: 2,
        sourceText: 'world',
        translatedText: '世界',
        status: 'done',
      },
    ])
  })

  it('restores saved snapshots into page state', () => {
    const pages: DocumentPageState[] = [
      { pageNumber: 1, sourceText: '', translatedText: '', status: 'idle' },
      { pageNumber: 2, sourceText: '', translatedText: '', status: 'idle' },
    ]

    const restored = applySavedPageSnapshots(
      pages,
      [
        {
          pageNumber: 1,
          sourceText: 'src',
          translatedText: '# Parsed',
          parsedMarkdown: '# Parsed',
          status: 'parsed',
        },
        {
          pageNumber: 2,
          sourceText: 'src2',
          translatedText: 'Translated',
          status: 'done',
        },
      ],
      {
        documentId: 'doc-1',
        filePath: '/tmp/test.pdf',
        modelId: 'model',
        languages: ['en', 'zh'],
        autoDetectSource: true,
      },
    )

    expect(restored[0]?.status).toBe('parsed')
    expect(restored[0]?.parsedMarkdown).toBe('# Parsed')
    expect(restored[1]?.status).toBe('done')
    expect(restored[1]?.translatedText).toBe('Translated')
  })

  it('restores empty page snapshots without re-parsing', () => {
    const pages: DocumentPageState[] = [
      { pageNumber: 17, sourceText: '', translatedText: '', status: 'idle' },
    ]

    const restored = applySavedPageSnapshots(
      pages,
      [{ pageNumber: 17, sourceText: '', translatedText: '', status: 'empty' }],
      {
        documentId: 'doc-1',
        filePath: '/tmp/test.pdf',
        modelId: 'model',
        languages: ['en', 'zh'],
        autoDetectSource: true,
      },
    )

    expect(restored[0]?.status).toBe('empty')
  })
})
