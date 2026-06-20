import { describe, expect, it } from 'vitest'
import {
  buildModelTextFromUserBlocks,
  contentBlocksHaveDocxAttachments,
  isDocxFileBlock,
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
  })

  it('requires inline content for docx when docx mcp is not mounted', () => {
    expect(
      userBlocksHaveUnresolvedAttachments([{ type: 'file', name: 'a.docx', path: '/tmp/a.docx' }]),
    ).toBe(true)
  })
})

describe('contentBlocksHaveDocxAttachments', () => {
  it('returns true when any block is docx', () => {
    expect(
      contentBlocksHaveDocxAttachments([
        { type: 'text', text: 'hi' },
        { type: 'file', name: 'x.docx', path: '/x.docx' },
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

    expect(text).toContain('read_document')
    expect(text).toContain('/Users/wangxy/Documents/notes.docx')
  })
})
