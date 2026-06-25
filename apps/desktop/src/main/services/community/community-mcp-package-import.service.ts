import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import { McpMarketManifestSchema } from './adapters/mcp-market.adapter'
import { MCP_MANIFEST_FILENAME, slugifyMcpId } from './community-mcp-manifest.util'
import {
  assertZipSource,
  isCommunityReadyPackage,
  readJsonFile,
  runCommunityPackageImport,
  type PrepareCommunityPackageResult,
} from './community-package-import.util'

const PrepareInputSchema = z.object({
  packagePath: z.string().min(1),
  title: z.string().optional(),
})

function inferManifestFromPackageJson(
  packageJson: Record<string, unknown>,
  fallbackTitle?: string,
): Record<string, unknown> | null {
  const rawName = typeof packageJson.name === 'string' ? packageJson.name.trim() : fallbackTitle?.trim()
  if (!rawName) return null

  const mcpId = slugifyMcpId(rawName.replace(/^@/, '').replace(/\//g, '-'))
  const templates = [{ name: 'default', config: {} }]

  if (typeof packageJson.name === 'string' && packageJson.name.length > 0) {
    return {
      schemaVersion: 1,
      mcpId,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', packageJson.name],
      templates,
    }
  }

  const binValue = packageJson.bin
  if (typeof binValue === 'string' && binValue.trim()) {
    return {
      schemaVersion: 1,
      mcpId,
      transport: 'stdio',
      command: 'node',
      args: [binValue.trim()],
      templates,
    }
  }
  if (binValue && typeof binValue === 'object' && !Array.isArray(binValue)) {
    const firstBin = Object.values(binValue as Record<string, unknown>).find(
      (value) => typeof value === 'string' && value.trim(),
    )
    if (typeof firstBin === 'string') {
      return {
        schemaVersion: 1,
        mcpId,
        transport: 'stdio',
        command: 'node',
        args: [firstBin.trim()],
        templates,
      }
    }
  }

  const mainEntry =
    (typeof packageJson.main === 'string' && packageJson.main.trim()) ||
    (typeof packageJson.module === 'string' && packageJson.module.trim()) ||
    null
  if (mainEntry) {
    return {
      schemaVersion: 1,
      mcpId,
      transport: 'stdio',
      command: 'node',
      args: [mainEntry],
      templates,
    }
  }

  return null
}

function inferManifestFromPyproject(content: string, fallbackTitle?: string): Record<string, unknown> | null {
  const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m)
  const rawName = nameMatch?.[1]?.trim() || fallbackTitle?.trim()
  if (!rawName) return null

  return {
    schemaVersion: 1,
    mcpId: slugifyMcpId(rawName),
    transport: 'stdio',
    command: 'uvx',
    args: [rawName],
    templates: [{ name: 'default', config: {} }],
  }
}

function inferManifest(packageRoot: string, fallbackTitle?: string): Record<string, unknown> {
  const packageJson = readJsonFile<Record<string, unknown>>(join(packageRoot, 'package.json'))
  if (packageJson) {
    const manifest = inferManifestFromPackageJson(packageJson, fallbackTitle)
    if (manifest) return manifest
  }

  const pyprojectPath = join(packageRoot, 'pyproject.toml')
  if (existsSync(pyprojectPath)) {
    const manifest = inferManifestFromPyproject(readFileSync(pyprojectPath, 'utf8'), fallbackTitle)
    if (manifest) return manifest
  }

  throw new Error(
    '无法从该 zip 识别 MCP 配置。请确认压缩包内含 package.json 或 pyproject.toml，或已是 Toolman 社区包（含 mcp.manifest.json）。',
  )
}

export async function prepareCommunityMcpPackage(
  input: unknown,
): Promise<PrepareCommunityPackageResult> {
  const parsed = PrepareInputSchema.parse(input)
  const sourcePath = parsed.packagePath
  assertZipSource(sourcePath, 'MCP 资源包')

  return runCommunityPackageImport({
    sourcePath,
    title: parsed.title,
    resourceLabel: 'MCP 资源包',
    zipLabel: 'MCP 压缩包',
    stagingPrefix: 'toolman-mcp-import-',
    rootMarkers: [MCP_MANIFEST_FILENAME, 'package.json', 'pyproject.toml'],
    manifestFilename: MCP_MANIFEST_FILENAME,
    packageExtension: '.toolman-mcp',
    zipBaseNamePrefix: 'community-mcp',
    packStagingPrefix: 'toolman-mcp-import-pack-',
    packLabel: 'MCP 资源',
    tryReturnReadyPackage(packageRoot) {
      if (!isCommunityReadyPackage(packageRoot, MCP_MANIFEST_FILENAME)) return null
      try {
        McpMarketManifestSchema.parse(readJsonFile(join(packageRoot, MCP_MANIFEST_FILENAME)))
        return {
          packagePath: sourcePath,
          normalized: false,
          message: '资源包已符合 Toolman 社区 MCP 格式，可直接提交。',
        }
      } catch {
        return null
      }
    },
    resolveManifest({ packageRoot, title, manifestPath }) {
      if (existsSync(manifestPath)) {
        const existing = readJsonFile(manifestPath)
        if (!existing) {
          throw new Error('mcp.manifest.json 无法解析，请检查 JSON 格式')
        }
        return {
          manifest: McpMarketManifestSchema.parse(existing) as Record<string, unknown>,
          generated: false,
          messageWhenNormalized: '已补全 SHA256SUMS 并转换为 .toolman-mcp 社区包。',
          messageWhenGenerated:
            '已从外部 MCP zip 自动生成 mcp.manifest.json 与 SHA256SUMS，并转换为 .toolman-mcp 社区包。',
        }
      }

      return {
        manifest: inferManifest(packageRoot, title),
        generated: true,
        messageWhenNormalized: '已补全 SHA256SUMS 并转换为 .toolman-mcp 社区包。',
        messageWhenGenerated:
          '已从外部 MCP zip 自动生成 mcp.manifest.json 与 SHA256SUMS，并转换为 .toolman-mcp 社区包。',
      }
    },
  })
}
