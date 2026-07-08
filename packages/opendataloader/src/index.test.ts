import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildProfileConvertOptions, appendOdlHybridCliArgs } from './profiles.js'
import { parseOpenDataLoaderOutput, findOutputFileForTest } from './parse-output.js'
import { splitPdfPagesByMarkers } from './page-markers.js'

describe('buildProfileConvertOptions', () => {
  it('uses Toolman-compatible page separators', () => {
    const options = buildProfileConvertOptions('knowledge')
    expect(options.textPageSeparator).toContain('%page-number%')
    expect(options.textPageSeparator).toContain('【第')
  })

  it('limits page range for translation profile', () => {
    const options = buildProfileConvertOptions('translation', {
      pageRange: { start: 2, end: 4 },
    })
    expect(options.pages).toBe('2-4')
    expect(options.format).toContain('text')
  })

  it('applies hybrid OCR options when configured', () => {
    const hybrid = {
      backend: 'hancom-ai' as const,
      url: 'http://localhost:5002',
      mode: 'full' as const,
      hancomAiOcrStrategy: 'force' as const,
      timeoutMs: 600_000,
    }
    const options = buildProfileConvertOptions('knowledge', { odlHybrid: hybrid })
    expect(options.hybrid).toBe('hancom-ai')
    expect(options.hybridMode).toBe('full')
    expect(options.hybridUrl).toBe('http://localhost:5002')
    expect(options.hybridFallback).toBe(true)
    expect(options.hybridTimeout).toBe('600000')
    expect(appendOdlHybridCliArgs(hybrid)).toEqual([
      '--hybrid-hancom-ai-ocr-strategy',
      'force',
    ])
  })
})

describe('parseOpenDataLoaderOutput', () => {
  it('splits text output by page markers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-odl-test-'))
    const sourcePath = join(dir, 'sample.pdf')
    writeFileSync(
      join(dir, 'sample.txt'),
      '【第 1 页】\nTitle\n\n【第 2 页】\nBody paragraph',
      'utf8',
    )
    writeFileSync(join(dir, 'sample.json'), JSON.stringify({ page_count: 2 }), 'utf8')

    const parsed = parseOpenDataLoaderOutput({ sourcePath, outputDir: dir })
    expect(parsed.totalPages).toBe(2)
    expect(parsed.pages).toEqual([
      { pageNumber: 1, text: 'Title' },
      { pageNumber: 2, text: 'Body paragraph' },
    ])
    expect(parsed.plainText).toContain('【第 1 页/2】')
  })

  it('finds output file by matching basename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-odl-find-'))
    writeFileSync(join(dir, 'sample.txt'), 'hello', 'utf8')
    const found = findOutputFileForTest(dir, join(dir, 'sample.pdf'), '.txt')
    expect(found).toBe(join(dir, 'sample.txt'))
  })

  it('assigns unpaginated text to a single-page range', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-odl-single-'))
    const sourcePath = join(dir, 'sample.pdf')
    writeFileSync(join(dir, 'sample.txt'), 'Click Download to see negotiation minutes.\nSAR', 'utf8')

    const parsed = parseOpenDataLoaderOutput({
      sourcePath,
      outputDir: dir,
      pageRange: { start: 1, end: 1 },
    })
    expect(parsed.pages).toEqual([
      { pageNumber: 1, text: 'Click Download to see negotiation minutes.\nSAR' },
    ])
  })

  it('uses markdown body when txt only contains nested page markers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-odl-nested-'))
    const sourcePath = join(dir, 'sample.pdf')
    writeFileSync(join(dir, 'sample.txt'), '【第 1 页/48】\n【第 1 页】', 'utf8')
    writeFileSync(
      join(dir, 'sample.md'),
      '【第 1 页】\n\n# CONTRACT FOR Hamlet Electrification Project',
      'utf8',
    )

    const parsed = parseOpenDataLoaderOutput({
      sourcePath,
      outputDir: dir,
      pageRange: { start: 1, end: 1 },
    })
    expect(parsed.pages[0]?.text).toContain('CONTRACT FOR Hamlet Electrification Project')
  })

  it('does not assign all page markers to page 1 on full-document parse', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-odl-markers-'))
    const sourcePath = join(dir, 'sample.pdf')
    writeFileSync(
      join(dir, 'sample.txt'),
      ['【第 1 页】', '【第 2 页】', '【第 3 页】', '【第 4 页】', '【第 5 页】', '【第 6 页】', '【第 7 页】'].join(
        '\n',
      ),
      'utf8',
    )
    writeFileSync(
      join(dir, 'sample.md'),
      '【第 1 页】\n\n# CONTRACT FOR Hamlet Electrification Project',
      'utf8',
    )

    const parsed = parseOpenDataLoaderOutput({ sourcePath, outputDir: dir })
    expect(parsed.pages.find((page) => page.pageNumber === 1)?.text).toContain('CONTRACT FOR')
    expect(parsed.pages.filter((page) => page.pageNumber === 1)).toHaveLength(1)
  })
})

describe('splitPdfPagesByMarkers', () => {
  it('supports total page suffix in markers', () => {
    expect(
      splitPdfPagesByMarkers('【第 1 页/3】\nA\n\n【第 2 页/3】\nB').map((page) => page.pageNumber),
    ).toEqual([1, 2])
  })
})
