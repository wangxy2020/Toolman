import { describe, expect, it } from 'vitest'
import { chunkPdfText } from './pdf-chunker.js'
import {
  enhanceQueryForPdfPageSearch,
  extractPdfPageQueryHint,
  formatPdfPageMarker,
  hasPdfPageMarkers,
  splitPdfPagesByMarkers,
} from '../parsers/pdf-page-markers.js'

describe('pdf-page-markers', () => {
  it('formats and splits page markers', () => {
    const text = [
      `${formatPdfPageMarker(1, 3)}\n第一页内容`,
      `${formatPdfPageMarker(2, 3)}\n第二页内容`,
      `${formatPdfPageMarker(3, 3)}\n第三页内容`,
    ].join('\n\n')

    expect(hasPdfPageMarkers(text)).toBe(true)
    expect(splitPdfPagesByMarkers(text)).toEqual([
      { pageNumber: 1, text: '第一页内容' },
      { pageNumber: 2, text: '第二页内容' },
      { pageNumber: 3, text: '第三页内容' },
    ])
  })

  it('extracts page hints from natural-language queries', () => {
    expect(extractPdfPageQueryHint('这个文件第6页写了什么？')).toBe(6)
    expect(extractPdfPageQueryHint('What is on page 12?')).toBe(12)
    expect(enhanceQueryForPdfPageSearch('这个文件第6页写了什么？')).toContain('【第 6 页】')
  })
})

describe('chunkPdfText', () => {
  it('keeps chunks within a single page and prefixes page markers', () => {
    const text = [
      `${formatPdfPageMarker(6, 10)}\n${'第六页正文。'.repeat(80)}`,
      `${formatPdfPageMarker(7, 10)}\n第七页正文。`,
    ].join('\n\n')

    const chunks = chunkPdfText(text, {
      strategy: 'fixed',
      chunkSize: 120,
      chunkOverlap: 16,
    })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.text.startsWith('【第'))).toBe(true)
    expect(chunks.some((chunk) => chunk.metadata?.pageNumber === 6)).toBe(true)
    expect(chunks.some((chunk) => chunk.metadata?.pageNumber === 7)).toBe(true)
    expect(chunks.every((chunk) => !chunk.text.includes('第七页正文') || chunk.metadata?.pageNumber === 7)).toBe(
      true,
    )
  })
})
