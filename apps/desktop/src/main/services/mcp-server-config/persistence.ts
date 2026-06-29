import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { McpServerConfigSchema, type McpServerConfig } from '@toolman/shared'
import { defaultAllServers } from './defaults'
import { mergeWithDefaultServers } from './merge'

const CONFIG_FILE = 'mcp-servers.json'

export function configPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, CONFIG_FILE)
}

function shouldPersistMergedConfig(before: McpServerConfig[], after: McpServerConfig[]): boolean {
  if (before.length !== after.length) return true

  const beforeById = new Map(before.map((server) => [server.id, server]))
  for (const server of after) {
    const prev = beforeById.get(server.id)
    if (!prev) return true
    if (JSON.stringify(prev) !== JSON.stringify(server)) return true
  }

  return false
}

export function saveAll(servers: McpServerConfig[]): void {
  writeFileSync(configPath(), JSON.stringify(servers, null, 2), 'utf8')
}

function loadRaw(): McpServerConfig[] {
  const path = configPath()
  if (!existsSync(path)) {
    const defaults = defaultAllServers()
    saveAll(defaults)
    return defaults
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!Array.isArray(parsed)) {
      const defaults = defaultAllServers()
      saveAll(defaults)
      return defaults
    }
    const items = parsed.map((item) => McpServerConfigSchema.parse(item))
    const merged = mergeWithDefaultServers(items)
    if (shouldPersistMergedConfig(items, merged)) {
      saveAll(merged)
    }
    return merged
  } catch {
    const defaults = defaultAllServers()
    saveAll(defaults)
    return defaults
  }
}

let cache: McpServerConfig[] | null = null

export function getServers(): McpServerConfig[] {
  if (!cache) cache = loadRaw()
  return cache
}

export function refreshCache(): McpServerConfig[] {
  cache = loadRaw()
  return cache
}

export function invalidateMcpServerCache(): void {
  cache = null
}
