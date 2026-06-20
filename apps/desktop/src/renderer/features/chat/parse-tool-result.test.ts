import { describe, expect, it } from 'vitest'

import { parseToolResult, summarizeToolResult } from './parse-tool-result'

describe('parseToolResult', () => {
  it('parses fs_list output', () => {
    const raw = '[dir] docs\n[file] readme.txt'
    const parsed = parseToolResult('fs_list', raw)
    expect(parsed.type).toBe('fs_list')
    if (parsed.type === 'fs_list') {
      expect(parsed.entries).toHaveLength(2)
    }
    expect(summarizeToolResult(parsed, raw)).toContain('共2项')
  })

  it('parses docx save_document output paths', () => {
    const raw = JSON.stringify({
      success: true,
      path: '/Users/wangxy/Documents/revised.docx',
    })
    const parsed = parseToolResult('mcp__docx-mcp-server__save_document', raw)
    expect(parsed.type).toBe('docx_file')
    if (parsed.type === 'docx_file') {
      expect(parsed.paths).toEqual(['/Users/wangxy/Documents/revised.docx'])
    }
    expect(summarizeToolResult(parsed, raw)).toContain('revised.docx')
  })
})
