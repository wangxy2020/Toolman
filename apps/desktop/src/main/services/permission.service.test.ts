import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'

import { evaluateToolPermission, isDeleteTool, parseEnvironmentVariables, resolveWorkingDirectory } from './permission.service'

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
  it('allows write tools without approval', () => {
    expect(
      evaluateToolPermission({
        toolName: 'mcp__docx__replace_text',
        permissionMode: 'normal',
        toolStates: {},
        autonomousMode: true,
      }),
    ).toEqual({ allowed: true })
  })

  it('requires approval for exec tools', () => {
    expect(
      evaluateToolPermission({
        toolName: 'bash',
        permissionMode: 'normal',
        toolStates: {},
        autonomousMode: true,
      }),
    ).toEqual({
      allowed: false,
      reason: '执行工具 bash 需要人工授权',
      requiresApproval: true,
    })
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

describe('evaluateToolPermission full-auto mode', () => {
  it('allows write tools without approval', () => {
    expect(
      evaluateToolPermission({
        toolName: 'mcp__docx__replace_text',
        permissionMode: 'full-auto',
        toolStates: {},
      }),
    ).toEqual({ allowed: true })
  })
})

describe('permission helpers', () => {
  it('parses environment variables from KEY=VALUE lines', () => {
    expect(parseEnvironmentVariables('FOO=bar\n# comment\nBAZ=qux')).toEqual({
      FOO: 'bar',
      BAZ: 'qux',
    })
  })

  it('resolves working directory with fallback', () => {
    expect(resolveWorkingDirectory(undefined)).toBe(homedir())
    expect(resolveWorkingDirectory('/tmp/custom')).toBe('/tmp/custom')
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

  it('requires approval for unknown MCP tools defaulting to exec category', () => {
    expect(
      evaluateToolPermission({
        toolName: 'mcp__custom-server__run_task',
        permissionMode: 'normal',
        toolStates: {},
      }),
    ).toEqual({
      allowed: false,
      reason: '执行工具 mcp__custom-server__run_task 需要人工授权、预授权或全自动权限模式',
      requiresApproval: true,
    })
  })
})
