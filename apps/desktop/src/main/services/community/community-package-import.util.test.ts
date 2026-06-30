import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import {
  assertZipSource,
  COMMUNITY_CHECKSUMS_FILENAME,
  extractZip,
  isCommunityReadyPackage,
  listRelativeFiles,
  looksLikeZip,
  readJsonFile,
  readZipEntryText,
  repackDirectory,
  runCommunityPackageImport,
  resolvePackageRoot,
  safeZipBaseName,
  slugifyCommunityId,
  writeChecksumsFile,
  zipDirectory,
} from './community-package-import.util'

describe('community-package-import.util', () => {
  it('slugifyCommunityId normalizes names', () => {
    expect(slugifyCommunityId('Hello World!!!')).toBe('hello-world')
    expect(slugifyCommunityId('---')).toBe('community-resource')
    expect(slugifyCommunityId('中文 资源 Pack')).toBe('pack')
  })

  it('looksLikeZip detects PK header', () => {
    expect(looksLikeZip(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true)
    expect(looksLikeZip(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toBe(false)
    expect(looksLikeZip(Buffer.from([0x50, 0x4b]))).toBe(false)
  })

  it('lists relative files recursively with forward slashes', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-community-list-'))
    mkdirSync(join(root, 'nested'), { recursive: true })
    writeFileSync(join(root, 'a.txt'), 'a', 'utf8')
    writeFileSync(join(root, 'nested', 'b.txt'), 'b', 'utf8')

    expect(listRelativeFiles(root)).toEqual(['a.txt', 'nested/b.txt'])
    rmSync(root, { recursive: true, force: true })
  })

  it('writes checksums and round-trips zip directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-community-zip-'))
    const bundle = join(root, 'bundle')
    mkdirSync(bundle, { recursive: true })
    writeFileSync(join(bundle, 'demo.txt'), 'hello', 'utf8')

    writeChecksumsFile(bundle)
    expect(readFileSync(join(bundle, COMMUNITY_CHECKSUMS_FILENAME), 'utf8')).toContain('demo.txt')

    const zipPath = join(root, 'demo.zip')
    zipDirectory(bundle, zipPath)
    expect(readZipEntryText(zipPath, 'demo.txt')).toBe('hello')

    const extractDir = join(root, 'extracted')
    extractZip(zipPath, extractDir)
    expect(readFileSync(join(extractDir, 'demo.txt'), 'utf8')).toBe('hello')

    rmSync(root, { recursive: true, force: true })
  })

  it('readZipEntryText throws for missing entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-community-missing-entry-'))
    const bundle = join(root, 'bundle')
    mkdirSync(bundle, { recursive: true })
    writeFileSync(join(bundle, 'demo.txt'), 'hello', 'utf8')
    const zipPath = join(root, 'demo.zip')
    zipDirectory(bundle, zipPath)

    expect(() => readZipEntryText(zipPath, 'missing.txt')).toThrow('Missing zip entry')
    rmSync(root, { recursive: true, force: true })
  })

  it('resolvePackageRoot returns extract dir when markers are absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-community-root-'))
    writeFileSync(join(root, 'manifest.json'), '{}', 'utf8')
    expect(resolvePackageRoot(root, ['manifest.json'])).toBe(root)

    const nestedRoot = mkdtempSync(join(tmpdir(), 'toolman-community-nested-'))
    const nested = join(nestedRoot, 'pkg')
    mkdirSync(nested)
    writeFileSync(join(nested, 'manifest.json'), '{}', 'utf8')
    expect(resolvePackageRoot(nestedRoot, ['manifest.json'])).toBe(nested)

    rmSync(root, { recursive: true, force: true })
    rmSync(nestedRoot, { recursive: true, force: true })

    const emptyRoot = mkdtempSync(join(tmpdir(), 'toolman-community-empty-root-'))
    expect(resolvePackageRoot(emptyRoot, ['manifest.json'])).toBe(emptyRoot)
    rmSync(emptyRoot, { recursive: true, force: true })
  })

  it('readJsonFile returns null for missing or invalid json', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-community-json-'))
    expect(readJsonFile(join(root, 'missing.json'))).toBeNull()

    writeFileSync(join(root, 'bad.json'), '{', 'utf8')
    expect(readJsonFile(join(root, 'bad.json'))).toBeNull()

    writeFileSync(join(root, 'ok.json'), '{"a":1}', 'utf8')
    expect(readJsonFile<{ a: number }>(join(root, 'ok.json'))).toEqual({ a: 1 })

    rmSync(root, { recursive: true, force: true })
  })

  it('isCommunityReadyPackage checks manifest and checksums', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-community-ready-'))
    expect(isCommunityReadyPackage(root, 'manifest.json')).toBe(false)

    writeFileSync(join(root, 'manifest.json'), '{}', 'utf8')
    writeFileSync(join(root, COMMUNITY_CHECKSUMS_FILENAME), 'abc  file\n', 'utf8')
    expect(isCommunityReadyPackage(root, 'manifest.json')).toBe(true)

    rmSync(root, { recursive: true, force: true })
  })

  it('safeZipBaseName sanitizes titles', () => {
    expect(safeZipBaseName('/tmp/My Package.zip', 'Demo Title', 'fallback')).toBe('Demo_Title')
    expect(safeZipBaseName('/tmp/weird@@.zip', undefined, 'fallback')).toBe('weird_')
  })

  it('assertZipSource rejects missing and non-zip files', () => {
    expect(() => assertZipSource('/missing.zip', '资源包')).toThrow('资源包文件不存在')

    const root = mkdtempSync(join(tmpdir(), 'toolman-community-assert-'))
    const txt = join(root, 'plain.txt')
    writeFileSync(txt, 'not a zip', 'utf8')
    expect(() => assertZipSource(txt, '资源包')).toThrow('资源包必须是 zip 格式')

    const bundle = join(root, 'bundle')
    mkdirSync(bundle)
    writeFileSync(join(bundle, 'file.txt'), 'x', 'utf8')
    const zipPath = join(root, 'ok.zip')
    zipDirectory(bundle, zipPath)
    expect(() => assertZipSource(zipPath, '资源包')).not.toThrow()

    rmSync(root, { recursive: true, force: true })
  })

  it('repackDirectory bundles checksums and zip output', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-community-repack-'))
    const source = join(root, 'source')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'data.txt'), 'payload', 'utf8')

    const { packagePath } = repackDirectory({
      sourceDir: source,
      zipFileName: 'out.zip',
      stagingPrefix: 'toolman-repack-',
    })

    expect(readZipEntryText(packagePath, 'data.txt')).toBe('payload')
    expect(readZipEntryText(packagePath, COMMUNITY_CHECKSUMS_FILENAME)).toContain('data.txt')
    rmSync(root, { recursive: true, force: true })
  })

  it('runCommunityPackageImport normalizes packages without ready manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-community-run-'))
    const bundle = join(root, 'bundle')
    mkdirSync(bundle, { recursive: true })
    writeFileSync(join(bundle, 'skill.md'), '# demo', 'utf8')
    const zipPath = join(root, 'input.zip')
    zipDirectory(bundle, zipPath)

    const result = runCommunityPackageImport({
      sourcePath: zipPath,
      title: 'Demo Skill',
      resourceLabel: '技能包',
      zipLabel: '技能包',
      stagingPrefix: 'toolman-skill-import-',
      rootMarkers: ['skill.md'],
      manifestFilename: 'manifest.json',
      packageExtension: '.skill.zip',
      zipBaseNamePrefix: 'skill',
      packStagingPrefix: 'toolman-skill-pack-',
      packLabel: '技能',
      tryReturnReadyPackage: () => null,
      resolveManifest: ({ title }) => ({
        manifest: { name: title ?? 'skill', version: '1.0.0' },
        generated: true,
        messageWhenNormalized: 'normalized',
        messageWhenGenerated: 'generated manifest',
      }),
    })

    expect(result.normalized).toBe(true)
    expect(result.message).toBe('generated manifest')
    expect(readZipEntryText(result.packagePath, 'manifest.json')).toContain('Demo Skill')
    rmSync(root, { recursive: true, force: true })
  })

  it('runCommunityPackageImport returns ready packages without repacking', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-community-ready-run-'))
    const bundle = join(root, 'bundle')
    mkdirSync(bundle, { recursive: true })
    writeFileSync(join(bundle, 'skill.md'), '# demo', 'utf8')
    writeFileSync(join(bundle, 'manifest.json'), '{}', 'utf8')
    writeFileSync(join(bundle, COMMUNITY_CHECKSUMS_FILENAME), 'abc  skill.md\n', 'utf8')
    const zipPath = join(root, 'ready.zip')
    zipDirectory(bundle, zipPath)

    const result = runCommunityPackageImport({
      sourcePath: zipPath,
      resourceLabel: '技能包',
      zipLabel: '技能包',
      stagingPrefix: 'toolman-skill-ready-',
      rootMarkers: ['manifest.json'],
      manifestFilename: 'manifest.json',
      packageExtension: '.skill.zip',
      zipBaseNamePrefix: 'skill',
      packStagingPrefix: 'toolman-skill-pack-',
      packLabel: '技能',
      tryReturnReadyPackage: (packageRoot) =>
        isCommunityReadyPackage(packageRoot, 'manifest.json')
          ? { packagePath: zipPath, normalized: false, message: 'already ready' }
          : null,
      resolveManifest: () => ({
        manifest: {},
        generated: false,
        messageWhenNormalized: 'normalized',
        messageWhenGenerated: 'generated',
      }),
    })

    expect(result).toEqual({
      packagePath: zipPath,
      normalized: false,
      message: 'already ready',
    })
    rmSync(root, { recursive: true, force: true })
  })
})
