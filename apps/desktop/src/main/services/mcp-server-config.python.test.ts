import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const userDataDir = join('/tmp', `toolman-mcp-python-test-${Date.now()}`)

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataDir),
    isReady: vi.fn(() => true),
  },
}))

afterEach(() => {
  if (existsSync(userDataDir)) {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

describe('mcp-server-config python preset', () => {
  it('uses mcp-python-interpreter in default preset', async () => {
    vi.resetModules()
    const { listMcpServers } = await import('./mcp-server-config.service')
    const python = listMcpServers().find((server) => server.id === 'python')
    expect(python).toBeDefined()
    expect(python?.command).toBe('uvx')
    expect(python?.args).toEqual(['mcp-python-interpreter'])
  })

  it('migrates legacy mcp-server-python launch args on load', async () => {
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(
      join(userDataDir, 'mcp-servers.json'),
      JSON.stringify(
        [
          {
            id: 'python',
            name: 'Python',
            description: '官方 Python 执行 MCP（uvx）',
            type: 'stdio',
            enabled: true,
            command: 'uvx',
            args: ['mcp-server-python'],
            env: {},
            packageSource: 'default',
            longRunning: true,
            timeoutSeconds: 120,
          },
        ],
        null,
        2,
      ),
      'utf8',
    )

    vi.resetModules()
    const { listMcpServers } = await import('./mcp-server-config.service')
    const python = listMcpServers().find((server) => server.id === 'python')
    expect(python?.args).toEqual(['mcp-python-interpreter'])

    const persisted = JSON.parse(readFileSync(join(userDataDir, 'mcp-servers.json'), 'utf8')) as Array<{
      id: string
      args: string[]
    }>
    const persistedPython = persisted.find((server) => server.id === 'python')
    expect(persistedPython?.args).toEqual(['mcp-python-interpreter'])
  })

  it('strips postgres launch args and db fields from polluted python preset', async () => {
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(
      join(userDataDir, 'mcp-servers.json'),
      JSON.stringify(
        [
          {
            id: 'python',
            name: 'Python',
            description: '官方 Python 执行 MCP（uvx）',
            type: 'stdio',
            enabled: true,
            command: 'npx',
            args: [
              '-y',
              '@modelcontextprotocol/server-postgres',
              'postgres://postgres@localhost:5432/postgres',
            ],
            env: {},
            packageSource: 'default',
            longRunning: true,
            timeoutSeconds: 120,
            dbHost: 'localhost',
            dbPort: '5432',
            dbUser: 'postgres',
            dbPassword: '',
            dbName: 'postgres',
          },
        ],
        null,
        2,
      ),
      'utf8',
    )

    vi.resetModules()
    const { listMcpServers } = await import('./mcp-server-config.service')
    const python = listMcpServers().find((server) => server.id === 'python')
    expect(python?.command).toBe('uvx')
    expect(python?.args).toEqual(['mcp-python-interpreter'])
    expect(python?.dbHost).toBeUndefined()
    expect(python?.dbUser).toBeUndefined()
  })
})
