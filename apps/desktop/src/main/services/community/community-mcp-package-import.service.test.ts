import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { readZipEntryText, zipDirectory } from './community-package-import.util'
import { prepareCommunityMcpPackage } from './community-mcp-package-import.service'

function createZipWithPackageJson(name: string, packageJson: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'toolman-mcp-import-test-'))
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  const zipPath = join(root, `${name}.zip`)
  zipDirectory(root, zipPath)
  return zipPath
}

describe('prepareCommunityMcpPackage', () => {
  it('converts external npm-style MCP zip into toolman community package', async () => {
    const zipPath = createZipWithPackageJson('fetch-mcp', {
      name: '@modelcontextprotocol/server-fetch',
      version: '1.0.0',
      bin: 'dist/index.js',
    })

    const result = await prepareCommunityMcpPackage({
      packagePath: zipPath,
      title: 'Fetch MCP',
    })

    expect(result.normalized).toBe(true)
    expect(result.packagePath.endsWith('.toolman-mcp')).toBe(true)
    expect(readFileSync(result.packagePath).subarray(0, 2).toString()).toBe('PK')
  })

  it('includes files in generated manifest', async () => {
    const zipPath = createZipWithPackageJson('files-mcp', {
      name: 'demo-mcp',
      version: '1.0.0',
      bin: 'index.js',
    })

    const result = await prepareCommunityMcpPackage({
      packagePath: zipPath,
      title: 'Files MCP',
    })

    const manifest = JSON.parse(readZipEntryText(result.packagePath, 'mcp.manifest.json'))
    expect(manifest.files).toEqual(expect.arrayContaining(['package.json', 'mcp.manifest.json']))
  })

  it('repacks zip that has manifest but missing files field', async () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-mcp-missing-files-test-'))
    const bundle = join(root, 'bundle')
    mkdirSync(bundle, { recursive: true })
    const manifest = {
      schemaVersion: 1,
      mcpId: 'ready-mcp',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'demo-mcp'],
      templates: [{ name: 'default', config: {} }],
    }
    const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`
    writeFileSync(join(bundle, 'mcp.manifest.json'), manifestJson, 'utf8')
    const manifestHash = createHash('sha256')
      .update(manifestJson)
      .digest('hex')
    writeFileSync(join(bundle, 'SHA256SUMS'), `${manifestHash}  mcp.manifest.json\n`, 'utf8')
    const zipPath = join(root, 'missing-files.zip')
    zipDirectory(bundle, zipPath)

    const result = await prepareCommunityMcpPackage({ packagePath: zipPath })
    expect(result.normalized).toBe(true)
    expect(result.packagePath.endsWith('.toolman-mcp')).toBe(true)

    rmSync(root, { recursive: true, force: true })
  })

  it('passes through zip that already contains manifest, files, and checksums', async () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-mcp-ready-test-'))
    const bundle = join(root, 'bundle')
    mkdirSync(bundle, { recursive: true })
    const manifest = {
      schemaVersion: 1,
      mcpId: 'ready-mcp',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'demo-mcp'],
      templates: [{ name: 'default', config: {} }],
      files: ['mcp.manifest.json'],
    }
    const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`
    writeFileSync(join(bundle, 'mcp.manifest.json'), manifestJson, 'utf8')
    const manifestHash = createHash('sha256')
      .update(manifestJson)
      .digest('hex')
    writeFileSync(join(bundle, 'SHA256SUMS'), `${manifestHash}  mcp.manifest.json\n`, 'utf8')
    const zipPath = join(root, 'ready.zip')
    zipDirectory(bundle, zipPath)

    const result = await prepareCommunityMcpPackage({ packagePath: zipPath })
    expect(result.normalized).toBe(false)
    expect(result.packagePath).toBe(zipPath)

    rmSync(root, { recursive: true, force: true })
  })
})
