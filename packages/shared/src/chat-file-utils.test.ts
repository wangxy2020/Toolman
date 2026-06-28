import { describe, expect, it } from 'vitest'
import {
  buildModelTextFromUserBlocks,
  buildStoredUserContent,
  contentBlocksHaveDocxAttachments,
  isDocxFileBlock,
  isDocxMcpSourceFileBlock,
  isLegacyWordFileBlock,
  shouldEnableToolsWithAttachments,
  userBlocksHaveUnresolvedAttachments,
} from './chat-file-utils.js'

describe('isDocxFileBlock', () => {
  it('detects docx attachments by extension and mime type', () => {
    expect(
      isDocxFileBlock({ type: 'file', name: 'notes.docx', path: '/tmp/notes.docx' }),
    ).toBe(true)
    expect(
      isDocxFileBlock({
        type: 'file',
        name: 'notes',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toBe(true)
    expect(isDocxFileBlock({ type: 'file', name: 'notes.pdf' })).toBe(false)
    expect(isDocxFileBlock({ type: 'file', name: 'notes.doc' })).toBe(false)
  })
})

describe('isLegacyWordFileBlock', () => {
  it('detects doc and wps attachments', () => {
    expect(isLegacyWordFileBlock({ type: 'file', name: 'notes.doc' })).toBe(true)
    expect(isLegacyWordFileBlock({ type: 'file', name: 'notes.wps' })).toBe(true)
    expect(isLegacyWordFileBlock({ type: 'file', name: 'notes.docx' })).toBe(false)
  })
})

describe('isDocxMcpSourceFileBlock', () => {
  it('includes docx, doc, and wps', () => {
    expect(isDocxMcpSourceFileBlock({ type: 'file', name: 'a.docx' })).toBe(true)
    expect(isDocxMcpSourceFileBlock({ type: 'file', name: 'a.doc' })).toBe(true)
    expect(isDocxMcpSourceFileBlock({ type: 'file', name: 'a.wps' })).toBe(true)
    expect(isDocxMcpSourceFileBlock({ type: 'file', name: 'a.pdf' })).toBe(false)
  })
})

describe('shouldEnableToolsWithAttachments', () => {
  it('enables tools for docx uploads when docx-mcp-server is mounted', () => {
    expect(
      shouldEnableToolsWithAttachments(['docx-mcp-server', 'filesystem'], [
        { type: 'file', name: 'a.docx', path: '/tmp/a.docx' },
        { type: 'text', text: '请批注' },
      ]),
    ).toBe(true)
  })

  it('enables tools for legacy word uploads when docx-mcp-server is mounted', () => {
    expect(
      shouldEnableToolsWithAttachments(['docx-mcp-server'], [
        { type: 'file', name: 'a.doc', path: '/tmp/a.doc' },
      ]),
    ).toBe(true)
    expect(
      shouldEnableToolsWithAttachments(['docx-mcp-server'], [
        { type: 'file', name: 'a.wps', path: '/tmp/a.wps' },
      ]),
    ).toBe(true)
  })

  it('keeps tools disabled for non-docx attachments', () => {
    expect(
      shouldEnableToolsWithAttachments(['docx-mcp-server'], [
        { type: 'file', name: 'a.pdf', path: '/tmp/a.pdf' },
      ]),
    ).toBe(false)
  })
})

describe('userBlocksHaveUnresolvedAttachments', () => {
  it('treats docx mcp attachments as ready without inline content', () => {
    expect(
      userBlocksHaveUnresolvedAttachments(
        [{ type: 'file', name: 'a.docx', path: '/tmp/a.docx', delivery: 'docx_tool' }],
        { mcpServerIds: ['docx-mcp-server'] },
      ),
    ).toBe(false)
    expect(
      userBlocksHaveUnresolvedAttachments(
        [{ type: 'file', name: 'a.doc', path: '/tmp/a.doc', delivery: 'docx_tool' }],
        { mcpServerIds: ['docx-mcp-server'] },
      ),
    ).toBe(false)
  })

  it('requires inline content for docx when docx mcp is not mounted', () => {
    expect(
      userBlocksHaveUnresolvedAttachments([{ type: 'file', name: 'a.docx', path: '/tmp/a.docx' }]),
    ).toBe(true)
  })
})

describe('contentBlocksHaveDocxAttachments', () => {
  it('returns true when any block is docx mcp source', () => {
    expect(
      contentBlocksHaveDocxAttachments([
        { type: 'text', text: 'hi' },
        { type: 'file', name: 'x.doc', path: '/x.doc' },
      ]),
    ).toBe(true)
  })
})

describe('buildModelTextFromUserBlocks', () => {
  it('includes docx_tool attachment paths for MCP', () => {
    const text = buildModelTextFromUserBlocks([
      { type: 'text', text: '请批注' },
      {
        type: 'file',
        name: 'notes.docx',
        path: '/Users/wangxy/Documents/notes.docx',
        delivery: 'docx_tool',
      },
    ])

    expect(text).toContain('DOCX MCP 结构化审查流水线')
    expect(text).toContain('/Users/wangxy/Documents/notes.docx')
  })

  it('includes excel_tool attachment paths for MCP', () => {
    const text = buildModelTextFromUserBlocks([
      { type: 'text', text: '请审查表格' },
      {
        type: 'file',
        name: 'invoice.xlsx',
        path: '/tmp/invoice.xlsx',
        delivery: 'excel_tool',
      },
    ])

    expect(text).toContain('Excel MCP 结构化审查流水线')
    expect(text).toContain('/tmp/invoice.xlsx')
  })
})

describe('buildStoredUserContent', () => {
  it('includes image labels in stored summary', () => {
    expect(
      buildStoredUserContent([
        { type: 'image', blobHash: 'abc', mimeType: 'image/png', alt: 'chart.png' },
        { type: 'text', text: '分析一下' },
      ]),
    ).toBe('图片：chart.png\n分析一下')
  })
})
