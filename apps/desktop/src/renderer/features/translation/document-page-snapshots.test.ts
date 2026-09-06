import { describe, expect, it } from 'vitest'
import { setCachedPageFit } from './document-page-fit-cache'
import {
  applyFitRecordsToSnapshots,
  applySavedPageSnapshots,
  buildDocumentPageSnapshots,
  createLightweightPagesFromSnapshots,
  mergeLiveSnapshotsWithSaved,
  pageCountFromSnapshots,
  resolvePageFromSnapshot,
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

  it('returns the same page array when snapshots already match', () => {
    const pages: DocumentPageState[] = [
      {
        pageNumber: 1,
        sourceText: 'src',
        translatedText: '# Parsed',
        parsedMarkdown: '# Parsed',
        status: 'parsed',
      },
    ]
    const snapshots = [
      {
        pageNumber: 1,
        sourceText: 'src',
        translatedText: '# Parsed',
        parsedMarkdown: '# Parsed',
        status: 'parsed' as const,
      },
    ]

    expect(
      applySavedPageSnapshots(
        pages,
        snapshots,
        {
          documentId: 'doc-1',
          filePath: '/tmp/test.pdf',
          modelId: 'model',
          languages: ['en', 'zh'],
          autoDetectSource: true,
        },
      ),
    ).toBe(pages)
  })

  it('keeps already restored pages when merging later snapshot clones', () => {
    const pages: DocumentPageState[] = [
      {
        pageNumber: 1,
        sourceText: 'src',
        translatedText: '# Parsed',
        parsedMarkdown: '# Parsed',
        status: 'parsed',
      },
    ]
    const clonedSnapshots = [
      {
        pageNumber: 1,
        sourceText: 'src',
        translatedText: '# Parsed',
        parsedMarkdown: '# Parsed',
        status: 'parsed' as const,
      },
    ]

    expect(
      applySavedPageSnapshots(
        pages,
        clonedSnapshots,
        {
          documentId: 'doc-1',
          filePath: '/tmp/test.pdf',
          modelId: 'model',
          languages: ['en', 'zh'],
          autoDetectSource: true,
        },
        true,
      ),
    ).toBe(pages)
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

  it('counts pages from the highest saved snapshot number', () => {
    expect(pageCountFromSnapshots(undefined)).toBe(0)
    expect(
      pageCountFromSnapshots([
        { pageNumber: 2, sourceText: 'a', translatedText: '# a', status: 'parsed' },
        { pageNumber: 17, sourceText: '', translatedText: '', status: 'empty' },
      ]),
    ).toBe(17)
  })

  it('creates lightweight page slots without copying snapshot bodies', () => {
    const pages = createLightweightPagesFromSnapshots(
      [
        {
          pageNumber: 1,
          sourceText: 'src',
          translatedText: '# Parsed',
          parsedMarkdown: '# Parsed',
          status: 'parsed',
        },
        { pageNumber: 2, sourceText: '', translatedText: '', status: 'empty' },
      ],
      2,
    )

    expect(pages[0]).toEqual({
      pageNumber: 1,
      sourceText: '',
      translatedText: '',
      status: 'parsed',
    })
    expect(pages[1]?.status).toBe('empty')
  })

  it('resolves snapshot bodies only when the live page is still empty', () => {
    const lightweight: DocumentPageState = {
      pageNumber: 1,
      sourceText: '',
      translatedText: '',
      status: 'parsed',
    }
    const snapshot = {
      pageNumber: 1,
      sourceText: 'src',
      translatedText: '# Parsed',
      parsedMarkdown: '# Parsed',
      status: 'parsed' as const,
    }

    expect(resolvePageFromSnapshot(lightweight, snapshot).parsedMarkdown).toBe('# Parsed')
    expect(
      resolvePageFromSnapshot(
        { ...lightweight, translatedText: '# Live', parsedMarkdown: '# Live' },
        snapshot,
      ).parsedMarkdown,
    ).toBe('# Live')
  })

  it('keeps saved snapshot bodies when merging incomplete live pages', () => {
    const merged = mergeLiveSnapshotsWithSaved(
      [{ pageNumber: 1, sourceText: '', translatedText: '', status: 'parsed' }],
      [
        {
          pageNumber: 1,
          sourceText: 'src',
          translatedText: '# Parsed',
          parsedMarkdown: '# Parsed',
          status: 'parsed',
        },
      ],
    )

    expect(merged[0]?.parsedMarkdown).toBe('# Parsed')
  })

  it('writes cached fit settings into snapshot Markdown', () => {
    setCachedPageFit('doc-1', 1, {
      fontSize: 11,
      lineHeight: 1.4,
      padding: 10,
      scale: 0.9,
      boxWidth: 500,
      boxHeight: 700,
    })
    const next = applyFitRecordsToSnapshots(
      [
        {
          pageNumber: 1,
          sourceText: 'src',
          translatedText: '# Parsed',
          parsedMarkdown: '# Parsed',
          status: 'parsed',
        },
      ],
      'doc-1',
    )
    expect(next[0]?.parsedMarkdown).toContain('<!-- tm-doc-fit')
    expect(next[0]?.parsedMarkdown).toContain('# Parsed')
  })
})
