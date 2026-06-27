import { describe, expect, it, vi } from 'vitest'
import type { McpServerConfig } from '@toolman/shared'

import {
  isBundledDocxMcpLaunch,
  isLegacyDocxMcpLaunch,
  repairDocxMcpLaunch,
  shouldRepairDocxMcpLaunch,
} from './mcp-docx-launch-repair'

vi.mock('./docx-mcp-paths', () => ({
  resolveDocxMcpServerEntryPath: () => '/tmp/mcp-docx/dist/docxServer.js',
}))

vi.mock('./mcp-node-runtime', () => ({
  resolveMcpNodeCommand: () => '/Applications/Toolman.app/Contents/MacOS/Toolman',
}))

const legacyNpx: McpServerConfig = {
  id: 'docx-mcp-server',
  name: 'DOCX MCP Server',
  description: 'legacy',
  type: 'stdio',
  enabled: true,
  command: 'npx',
  args: ['-y', 'docx-mcp-server'],
  env: {},
  packageSource: 'default',
  longRunning: true,
  timeoutSeconds: 120,
}

describe('mcp-docx-launch-repair', () => {
  it('detects legacy npx launch', () => {
    expect(isLegacyDocxMcpLaunch(legacyNpx)).toBe(true)
    expect(isBundledDocxMcpLaunch(legacyNpx)).toBe(false)
    expect(shouldRepairDocxMcpLaunch(legacyNpx)).toBe(true)
  })

  it('repairs legacy npx launch to bundled entry', () => {
    const repaired = repairDocxMcpLaunch(legacyNpx)
    expect(repaired.command).toBe('/Applications/Toolman.app/Contents/MacOS/Toolman')
    expect(repaired.args).toEqual(['/tmp/mcp-docx/dist/docxServer.js'])
  })

  it('keeps bundled launch unchanged', () => {
    const bundled: McpServerConfig = {
      ...legacyNpx,
      command: 'node',
      args: ['/app/resources/mcp-docx/dist/docxServer.js'],
    }
    expect(isBundledDocxMcpLaunch(bundled)).toBe(true)
    expect(repairDocxMcpLaunch(bundled)).toEqual(bundled)
  })

  it('repairs duplicate custom preset entries', () => {
    const custom: McpServerConfig = {
      ...legacyNpx,
      id: 'custom-docx-copy',
      name: 'My DOCX',
    }
    expect(shouldRepairDocxMcpLaunch(custom)).toBe(true)
    const repaired = repairDocxMcpLaunch(custom)
    expect(repaired.id).toBe('custom-docx-copy')
    expect(repaired.args?.[0]).toContain('docxServer.js')
  })
})
