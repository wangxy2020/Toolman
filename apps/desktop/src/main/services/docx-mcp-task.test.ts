import { describe, expect, it } from 'vitest'

import {
  DOCX_MCP_BATCH_TOOL_NAME,
  isDocxMcpEditToolName,
  isDocxMcpToolName,
  isDocxThoroughEditRequest,
  resolveDocxMcpShortToolName,
  shouldContinueDocxEditing,
} from './docx-mcp-task.service'

describe('docx mcp task helpers', () => {
  it('detects docx mcp tool names', () => {
    expect(isDocxMcpToolName('mcp__docx-mcp-server__read_document')).toBe(true)
    expect(isDocxMcpToolName('mcp__docx-mcp-server__add_comment')).toBe(true)
    expect(isDocxMcpToolName('bash')).toBe(false)
  })

  it('separates read and edit docx tools', () => {
    expect(isDocxMcpEditToolName('mcp__docx-mcp-server__read_document')).toBe(false)
    expect(isDocxMcpEditToolName('mcp__docx-mcp-server__add_comment')).toBe(true)
    expect(isDocxMcpEditToolName('mcp__docx-mcp-server__replace_text')).toBe(true)
    expect(isDocxMcpEditToolName(DOCX_MCP_BATCH_TOOL_NAME)).toBe(false)
  })

  it('resolves short tool names', () => {
    expect(resolveDocxMcpShortToolName('mcp__docx-mcp-server__edit_paragraph')).toBe(
      'edit_paragraph',
    )
  })

  it('detects thorough edit requests from user text', () => {
    expect(isDocxThoroughEditRequest('审查文件内容，修改错误，添加批注')).toBe(true)
    expect(isDocxThoroughEditRequest('hello')).toBe(false)
  })

  it('continues docx editing until minimum edits and idle rounds', () => {
    expect(
      shouldContinueDocxEditing({
        thorough: true,
        successfulEdits: 1,
        idleRoundsWithoutTools: 1,
        continueNudgesSent: 0,
      }),
    ).toBe(true)

    expect(
      shouldContinueDocxEditing({
        thorough: true,
        successfulEdits: 3,
        idleRoundsWithoutTools: 2,
        continueNudgesSent: 1,
      }),
    ).toBe(false)
  })
})
