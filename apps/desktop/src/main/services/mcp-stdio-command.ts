import { basename } from 'node:path'
import { resolveMcpNodeCommand } from './mcp-node-runtime'

const ALLOWED_STDIO_COMMAND_NAMES = new Set(['node', 'npx', 'npm', 'pnpm', 'uvx', 'uv'])

function hasPathSeparator(command: string): boolean {
  return command.includes('/') || command.includes('\\')
}

function commandBaseName(command: string): string {
  return basename(command)
    .toLowerCase()
    .replace(/\.(exe|cmd|bat)$/i, '')
}

export function isAllowedMcpStdioCommand(command: string): boolean {
  const trimmed = command.trim()
  if (!trimmed || trimmed.includes('..')) return false

  const bundled = resolveMcpNodeCommand()
  if (trimmed === bundled || trimmed === process.execPath) return true

  const name = commandBaseName(trimmed)
  if (!ALLOWED_STDIO_COMMAND_NAMES.has(name)) return false

  if (hasPathSeparator(trimmed)) {
    return name === 'node' && (trimmed === bundled || basename(trimmed) === basename(bundled))
  }
  return true
}

export function assertAllowedMcpStdioCommand(command: string): string {
  const trimmed = command.trim()
  if (!isAllowedMcpStdioCommand(trimmed)) {
    throw new Error('stdio MCP 只允许 node / npx / npm / pnpm / uvx / uv')
  }
  return trimmed
}
