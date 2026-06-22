import { describe, expect, it } from 'vitest'

import { evaluateToolPermission, isDeleteTool } from './permission.service'

describe('isDeleteTool', () => {
  it('detects builtin delete tools', () => {
    expect(isDeleteTool('fs_delete')).toBe(true)
    expect(isDeleteTool('fs_read')).toBe(false)
  })

  it('detects encoded MCP delete tools', () => {
    expect(isDeleteTool('mcp__server-a__delete_file')).toBe(true)
    expect(isDeleteTool('mcp__server-a__read_document')).toBe(false)
  })
})

describe('evaluateToolPermission autonomous mode', () => {
  it('allows write and exec tools without approval', () => {
    expect(
      evaluateToolPermission({
        toolName: 'mcp__docx__replace_text',
        permissionMode: 'normal',
        toolStates: {},
        autonomousMode: true,
      }),
    ).toEqual({ allowed: true })

    expect(
      evaluateToolPermission({
        toolName: 'bash',
        permissionMode: 'normal',
        toolStates: {},
        autonomousMode: true,
      }),
    ).toEqual({ allowed: true })
  })

  it('requires approval for delete tools', () => {
    expect(
      evaluateToolPermission({
        toolName: 'fs_delete',
        permissionMode: 'normal',
        toolStates: {},
        autonomousMode: true,
      }),
    ).toEqual({
      allowed: false,
      reason: '删除工具 fs_delete 需要人工授权',
      requiresApproval: true,
    })
  })
})

describe('evaluateToolPermission normal mode', () => {
  it('auto-allows read tools', () => {
    expect(
      evaluateToolPermission({
        toolName: 'mcp__docx__read_document',
        permissionMode: 'normal',
        toolStates: {},
      }),
    ).toEqual({ allowed: true })
  })

  it('requires approval for write tools', () => {
    expect(
      evaluateToolPermission({
        toolName: 'mcp__docx__replace_text',
        permissionMode: 'normal',
        toolStates: {},
      }),
    ).toEqual({
      allowed: false,
      reason: '写入工具 mcp__docx__replace_text 需要人工授权、预授权或自动编辑/全自动权限模式',
      requiresApproval: true,
    })
  })
})
