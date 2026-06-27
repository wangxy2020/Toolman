import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const userDataDir = join('/tmp', `toolman-mcp-docx-test-${Date.now()}`)

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataDir),
    isReady: vi.fn(() => true),
  },
}))

vi.mock('./docx-mcp-paths', () => ({
  resolveDocxMcpServerEntryPath: () => '/tmp/mcp-docx/dist/docxServer.js',
}))

vi.mock('./mcp-node-runtime', () => ({
  resolveMcpNodeCommand: () => '/Applications/Toolman.app/Contents/MacOS/Toolman',
}))

afterEach(() => {
  if (existsSync(userDataDir)) {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

describe('mcp-server-config docx preset', () => {
  it('migrates legacy npx docx-mcp-server launch args on load', async () => {
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(
      join(userDataDir, 'mcp-servers.json'),
      JSON.stringify(
        [
          {
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
          },
        ],
        null,
        2,
      ),
    )

    vi.resetModules()
    const { listMcpServers } = await import('./mcp-server-config.service')
    const docx = listMcpServers().find((server) => server.id === 'docx-mcp-server')
    expect(docx).toBeDefined()
    expect(docx?.command).toBe('/Applications/Toolman.app/Contents/MacOS/Toolman')
    expect(docx?.args).toEqual(['/tmp/mcp-docx/dist/docxServer.js'])

    const persisted = JSON.parse(readFileSync(join(userDataDir, 'mcp-servers.json'), 'utf8'))
    const savedDocx = persisted.find((server: { id: string }) => server.id === 'docx-mcp-server')
    expect(savedDocx.args).toEqual(['/tmp/mcp-docx/dist/docxServer.js'])
  })
})
