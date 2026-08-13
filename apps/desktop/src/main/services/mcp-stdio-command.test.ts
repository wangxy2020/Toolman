import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

vi.mock('./mcp-node-runtime', () => ({
  resolveMcpNodeCommand: () => 'node',
}))

describe('mcp-stdio-command', () => {
  it('allows launcher names and bundled node', async () => {
    const { isAllowedMcpStdioCommand } = await import('./mcp-stdio-command')
    expect(isAllowedMcpStdioCommand('node')).toBe(true)
    expect(isAllowedMcpStdioCommand('npx')).toBe(true)
    expect(isAllowedMcpStdioCommand('uvx')).toBe(true)
    expect(isAllowedMcpStdioCommand('pnpm')).toBe(true)
  })

  it('rejects shells and absolute binaries', async () => {
    const { isAllowedMcpStdioCommand, assertAllowedMcpStdioCommand } = await import(
      './mcp-stdio-command'
    )
    expect(isAllowedMcpStdioCommand('/bin/bash')).toBe(false)
    expect(isAllowedMcpStdioCommand('bash')).toBe(false)
    expect(isAllowedMcpStdioCommand('cmd.exe')).toBe(false)
    expect(isAllowedMcpStdioCommand('/usr/bin/npx')).toBe(false)
    expect(() => assertAllowedMcpStdioCommand('bash')).toThrow(/stdio MCP/)
  })
})
