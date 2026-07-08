import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearOdlPreviewCache,
  mergeOdlPreviewBatchIntoCache,
  peekOdlPreviewDocumentCache,
  renormalizeOdlPageRangeResult,
  sliceOdlDocumentResult,
} from './document-parser.service.js'
import type { DocumentParseResult } from '@toolman/opendataloader'

describe('mergeOdlPreviewBatchIntoCache', () => {
  const filePath = '/tmp/progressive.pdf'

  beforeEach(() => {
    clearOdlPreviewCache(filePath)
  })

  it('merges progressive batches by page number', () => {
    mergeOdlPreviewBatchIntoCache(
      filePath,
      {
        backend: 'opendataloader',
        totalPages: 4,
        plainText: '',
        markdown: '',
        pages: [
          { pageNumber: 1, text: 'One', markdown: '<p>One</p>' },
          { pageNumber: 2, text: 'Two', markdown: '<p>Two</p>' },
        ],
      },
      4,
    )
    mergeOdlPreviewBatchIntoCache(
      filePath,
      {
        backend: 'opendataloader',
        totalPages: 4,
        plainText: '',
        markdown: '',
        pages: [
          { pageNumber: 3, text: 'Three', markdown: '<p>Three</p>' },
          { pageNumber: 4, text: 'Four', markdown: '<p>Four</p>' },
        ],
      },
      4,
    )
    const cached = peekOdlPreviewDocumentCache(filePath)
    expect(cached?.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3, 4])
    const slice = sliceOdlDocumentResult(cached!, 2, 3)
    expect(slice.pages.map((page) => page.pageNumber)).toEqual([2, 3])
    expect(slice.pages[0]?.markdown).toContain('Two')
  })
})

describe('renormalizeOdlPageRangeResult', () => {
  it('remaps 1..N slice markers to absolute page numbers', () => {
    const normalized = renormalizeOdlPageRangeResult(
      {
        backend: 'opendataloader',
        totalPages: 6,
        plainText: '',
        markdown: '',
        pages: [
          { pageNumber: 1, text: 'A', markdown: '<p>A</p>' },
          { pageNumber: 2, text: 'B', markdown: '<p>B</p>' },
          { pageNumber: 3, text: 'C', markdown: '<p>C</p>' },
          { pageNumber: 4, text: 'D', markdown: '<p>D</p>' },
        ],
      },
      { start: 3, end: 6 },
      48,
    )
    expect(normalized.pages.map((page) => page.pageNumber)).toEqual([3, 4, 5, 6])
    expect(normalized.totalPages).toBe(48)
  })
})

describe('sliceOdlDocumentResult', () => {
  const fullDoc: DocumentParseResult = {
    backend: 'opendataloader',
    totalPages: 4,
    plainText: [
      '【第 1 页/4】\nPage one',
      '【第 2 页/4】\nPage two',
      '【第 3 页/4】\nPage three',
      '【第 4 页/4】\nPage four',
    ].join('\n\n'),
    markdown: 'Page one\n\nPage two\n\nPage three\n\nPage four',
    pages: [
      { pageNumber: 1, text: 'Page one' },
      { pageNumber: 2, text: 'Page two' },
      { pageNumber: 3, text: 'Page three' },
      { pageNumber: 4, text: 'Page four' },
    ],
  }

  it('slices page range without re-invoking ODL', () => {
    const slice = sliceOdlDocumentResult(fullDoc, 2, 3)
    expect(slice.pages.map((page) => page.pageNumber)).toEqual([2, 3])
    expect(slice.plainText).toContain('Page two')
    expect(slice.plainText).toContain('Page three')
    expect(slice.plainText).not.toContain('Page one')
    expect(slice.markdown).toContain('Page two')
  })
})
