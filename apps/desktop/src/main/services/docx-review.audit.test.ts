import { describe, expect, it } from 'vitest'

import {
  buildDocxAuditSystemPrompt,
  buildDocxAuditUserMessage,
  buildIsolatedDocxAuditMessages,
  resolveDocxReadDocumentContent,
} from './docx-review.service'

describe('buildDocxAuditUserMessage', () => {
  it('includes user request and working path', () => {
    const message = buildDocxAuditUserMessage({
      userRequest: '审查并批注',
      workingPath: '/tmp/修订版_a.docx',
      fileName: 'a.docx',
    })
    expect(message).toContain('审查并批注')
    expect(message).toContain('/tmp/修订版_a.docx')
  })

  it('discourages edit_paragraph when user did not request paragraph rewrite', () => {
    const message = buildDocxAuditUserMessage({
      userRequest: '审查并修正错别字',
      workingPath: '/tmp/修订版_a.docx',
      fileName: 'a.docx',
    })
    expect(message).toContain('不要使用 edit_paragraph')
  })

  it('allows edit_paragraph hint when user requests paragraph rewrite', () => {
    const message = buildDocxAuditUserMessage({
      userRequest: '将引言段整段重写为列表',
      workingPath: '/tmp/修订版_a.docx',
      fileName: 'a.docx',
    })
    expect(message).toContain('才使用 edit_paragraph')
    expect(message).not.toContain('不要使用 edit_paragraph')
  })
})

describe('buildDocxAuditSystemPrompt', () => {
  it('disables edit_paragraph by default', () => {
    const prompt = buildDocxAuditSystemPrompt({ userRequest: '全面审查文档' })
    expect(prompt).toContain('edit_paragraph（默认禁用）')
  })

  it('allows cautious edit_paragraph when user requests rewrite', () => {
    const prompt = buildDocxAuditSystemPrompt({ userRequest: '第二段整段替换为条目' })
    expect(prompt).toContain('edit_paragraph（谨慎使用）')
    expect(prompt).not.toContain('默认禁用')
  })

  it('uses domain-neutral guidance without contract-specific examples', () => {
    const prompt = buildDocxAuditSystemPrompt({ userRequest: '全面审查文档' })
    expect(prompt).toContain('主题保真')
    expect(prompt).not.toMatch(/合同|发包人|承包|甲方|乙方|公文/)
  })
})

describe('isolated docx audit context', () => {
  it('extracts read_document output for the matching working copy', () => {
    const workingPath = '/tmp/修订版_notes.docx'
    const content = resolveDocxReadDocumentContent(
      [
        { role: 'system', content: '你是合同审查专家' },
        { role: 'user', content: '请审查这份学习笔记' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'read-1',
              name: 'mcp__docx-mcp-server__read_document',
              arguments: JSON.stringify({ file_path: workingPath }),
            },
          ],
        },
        { role: 'tool', tool_call_id: 'read-1', content: '[0] 语言学习笔记\n[1] 第一遍' },
      ],
      workingPath,
    )
    expect(content).toContain('语言学习笔记')
  })

  it('builds audit messages without agent system prompt or chat history', () => {
    const messages = buildIsolatedDocxAuditMessages({
      userRequest: '只修正错别字',
      workingCopy: {
        sourcePath: '/tmp/notes.docx',
        workingPath: '/tmp/修订版_notes.docx',
        fileName: 'notes.docx',
      },
      documentContent: '[0] 示例段落',
    })

    expect(messages).toHaveLength(4)
    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content).not.toContain('合同审查专家')
    expect(messages.some((message) => {
      if (message.role !== 'tool') return false
      const content = message.content
      return typeof content === 'string' && content.includes('示例段落')
    })).toBe(
      true,
    )
    expect(messages.some((message) => {
      if (message.role !== 'user') return false
      const content = message.content
      return typeof content === 'string' && content.includes('只修正错别字')
    })).toBe(
      true,
    )
  })
})
