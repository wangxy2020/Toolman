import { describe, expect, it } from 'vitest'

import {
  LOCAL_FILE_LINK_SCHEME,
  buildLocalDocxMarkdownLink,
  linkifyLocalDocxPaths,
  sanitizeAssistantMarkdown,
} from './sanitize-assistant-markdown'

describe('sanitizeAssistantMarkdown', () => {
  it('removes fake tool_code blocks', () => {
    const raw = [
      '已完成审核。',
      '<tool_code>',
      'mcp__docx-mcp-server__apply_semantic_diff_overlay(audit_session_id="x")',
      '</tool_code>',
      '请查看结果。',
    ].join('\n')

    expect(sanitizeAssistantMarkdown(raw)).toBe('已完成审核。\n\n请查看结果。')
  })

  it('removes placeholder file links and linkifies real docx paths', () => {
    const raw = [
      '文件链接：[可点击的带批注文件链接]',
      '输出：/Users/wangxy/Documents/_AI_Audited_notes.docx',
    ].join('\n')

    const sanitized = sanitizeAssistantMarkdown(raw)
    expect(sanitized).not.toContain('可点击')
    expect(sanitized).toContain(
      `[_AI_Audited_notes.docx](${LOCAL_FILE_LINK_SCHEME}${encodeURIComponent('/Users/wangxy/Documents/_AI_Audited_notes.docx')})`,
    )
  })
})

describe('linkifyLocalDocxPaths', () => {
  it('does not double-link markdown links', () => {
    const linked = `[file.docx](${LOCAL_FILE_LINK_SCHEME}${encodeURIComponent('/tmp/file.docx')})`
    expect(linkifyLocalDocxPaths(linked)).toBe(linked)
  })

  it('preserves toolman-local markdown links', () => {
    const linked = buildLocalDocxMarkdownLink('/tmp/修订版_a.docx')
    expect(sanitizeAssistantMarkdown(`打开：${linked}`)).toContain('toolman-local://')
  })

  it('removes relative docx markdown links that open in browser', () => {
    const sanitized = sanitizeAssistantMarkdown('[修订版_a.docx](修订版_a.docx)')
    expect(sanitized).toBe('修订版_a.docx')
    expect(sanitized).not.toContain('](')
  })

  it('removes localhost docx markdown links', () => {
    const sanitized = sanitizeAssistantMarkdown(
      '[修订版_a.docx](http://localhost:5173/修订版_a.docx)',
    )
    expect(sanitized).toBe('修订版_a.docx')
  })

  it('removes localhost root links that open a blank dev page', () => {
    const sanitized = sanitizeAssistantMarkdown('[修订版_a.docx](http://localhost:5173)')
    expect(sanitized).toBe('修订版_a.docx')
    expect(sanitized).not.toContain('localhost')
  })

  it('replaces revision file inline markdown links', () => {
    const sanitized = sanitizeAssistantMarkdown('修订版文件：[修订版_a.docx](修订版_a.docx)')
    expect(sanitized).toBe('修订版文件：见下方链接')
  })

  it('replaces bold revision file inline markdown links', () => {
    const sanitized = sanitizeAssistantMarkdown(
      '**修订版文件：** [修订版_a.docx](http://localhost:5173)',
    )
    expect(sanitized).toBe('**修订版文件：** 修订版_a.docx')
    expect(sanitized).not.toContain('localhost')
    expect(sanitized).not.toContain('](')
  })
})
