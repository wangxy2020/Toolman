import { describe, expect, it } from 'vitest'

import { extractTaskToolTargetPaths } from './checkpoint-paths.js'

describe('extractTaskToolTargetPaths', () => {
  it('extracts fs_write path', () => {
    expect(extractTaskToolTargetPaths('fs_write', JSON.stringify({ path: 'notes.md', content: 'x' }))).toEqual([
      'notes.md',
    ])
  })

  it('extracts namespaced mcp tool path', () => {
    expect(
      extractTaskToolTargetPaths('filesystem__fs_edit', JSON.stringify({ path: 'a.txt', oldText: 'x', newText: 'y' })),
    ).toEqual(['a.txt'])
  })

  it('returns empty for readonly tools', () => {
    expect(extractTaskToolTargetPaths('fs_read', JSON.stringify({ path: 'a.txt' }))).toEqual([])
  })

  it('returns empty for invalid json', () => {
    expect(extractTaskToolTargetPaths('fs_write', 'not-json')).toEqual([])
  })
})
