import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const NAPI_TRIPLE_BY_PLATFORM: Record<string, string> = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'win32-x64': 'win32-x64-msvc',
  'win32-arm64': 'win32-arm64-msvc',
  'linux-x64': 'linux-x64-gnu',
  'linux-arm64': 'linux-arm64-gnu',
}

export function resolvePlatformTriple(): string {
  const key = `${process.platform}-${process.arch}`
  const triple = NAPI_TRIPLE_BY_PLATFORM[key]
  if (!triple) {
    throw new Error(`Unsupported platform: ${key}`)
  }
  return triple
}

function packagedNativeCandidates(fileName: string): string[] {
  const resourcesPath = process.resourcesPath
  if (!resourcesPath) return []

  return [
    join(resourcesPath, 'native', fileName),
    join(resourcesPath, 'app.asar.unpacked', 'native', fileName),
  ]
}

function devNativeCandidates(fileName: string, moduleDir: string): string[] {
  return [
    join(moduleDir, '..', '..', '..', '..', 'native', fileName),
    join(moduleDir, '..', '..', '..', 'native', fileName),
    join(moduleDir, '..', '..', 'native', fileName),
    join(process.cwd(), 'native', fileName),
    join(process.cwd(), 'apps', 'desktop', 'native', fileName),
  ]
}

export function resolveNativeAddonPath(
  moduleBaseName: string,
  moduleDir: string,
  buildScript: string,
): string {
  const triple = resolvePlatformTriple()
  const fileName = `${moduleBaseName}.${triple}.node`
  const candidates = [...packagedNativeCandidates(fileName), ...devNativeCandidates(fileName, moduleDir)]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    `${moduleBaseName} native module not found for ${triple}. Run: ${buildScript}`,
  )
}
