import { describe, expect, it } from 'vitest'

import {
  inferTaskArtifactKind,
  sanitizeArtifactFileName,
  guessMimeTypeFromFileName,
} from './artifact.js'

describe('artifact helpers', () => {
  it('sanitizes unsafe file names', () => {
    expect(sanitizeArtifactFileName('  report:final?.md  ')).toBe('report-final-.md')
    expect(sanitizeArtifactFileName('')).toBe('artifact')
  })

  it('infers artifact kind from extension', () => {
    expect(inferTaskArtifactKind('summary.md')).toBe('report')
    expect(inferTaskArtifactKind('chart.png')).toBe('image')
    expect(inferTaskArtifactKind('data.json')).toBe('data')
    expect(inferTaskArtifactKind('bundle.zip')).toBe('export')
  })

  it('guesses mime types', () => {
    expect(guessMimeTypeFromFileName('notes.md')).toBe('text/markdown')
    expect(guessMimeTypeFromFileName('table.csv')).toBe('text/csv')
  })
})
