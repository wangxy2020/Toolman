import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_DATA = join(tmpdir(), 'toolman-app-storage-test')

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? USER_DATA : join(tmpdir(), `toolman-${name}`)),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
  },
}))

vi.mock('./knowledge.service', () => ({
  purgeAllKnowledgeStorageData: vi.fn(),
}))

vi.mock('./memory-entry.service', () => ({
  purgeAllMemoryData: vi.fn(() => 0),
}))

vi.mock('./path-sandbox.service', () => ({
  assertPathWithinAllowedRoots: (path: string) => path,
}))

vi.mock('./toolman-user-documents.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./toolman-user-documents.service')>()
  return {
    ...actual,
    ensureToolmanUserDocumentFolders: () => join(tmpdir(), 'ToolmanData'),
    getToolmanUserRootPath: () => join(tmpdir(), 'ToolmanData'),
  }
})

describe('app-storage backup helpers', () => {
  let bundleRoot: string

  beforeEach(() => {
    rmSync(USER_DATA, { recursive: true, force: true })
    mkdirSync(USER_DATA, { recursive: true })
    bundleRoot = join(tmpdir(), `toolman-backup-${Date.now()}`)
    rmSync(bundleRoot, { recursive: true, force: true })
    mkdirSync(bundleRoot, { recursive: true })
    vi.resetModules()
  })

  it('detects backup bundles and single db files', async () => {
    const { isBackupBundle } = await import('./app-storage.service')

    expect(isBackupBundle('/missing/path')).toBe(false)

    const dbOnly = join(bundleRoot, 'toolman.db')
    writeFileSync(dbOnly, 'sqlite')
    expect(isBackupBundle(dbOnly)).toBe(true)

    const emptyDir = join(bundleRoot, 'empty-dir')
    mkdirSync(emptyDir)
    expect(isBackupBundle(emptyDir)).toBe(false)

    const manifestDir = join(bundleRoot, 'with-manifest')
    mkdirSync(manifestDir)
    writeFileSync(join(manifestDir, 'manifest.json'), '{}', 'utf8')
    expect(isBackupBundle(manifestDir)).toBe(true)
  })

  it('validates backup manifest shape', async () => {
    const { validateBackupManifest, readBackupManifest } = await import('./app-storage.service')

    expect(
      validateBackupManifest({
        version: 1,
        createdAt: Date.now(),
        includesKnowledge: true,
        includesNotes: false,
        dbPath: 'toolman.db',
        knowledgePath: 'knowledge',
        notesPath: null,
      }),
    ).toBe(true)

    expect(validateBackupManifest({ version: 2 })).toBe(false)
    expect(validateBackupManifest(null)).toBe(false)

    writeFileSync(
      join(bundleRoot, 'manifest.json'),
      JSON.stringify({
        version: 1,
        createdAt: Date.now(),
        includesKnowledge: false,
        includesNotes: false,
        dbPath: 'toolman.db',
        knowledgePath: null,
        notesPath: null,
      }),
      'utf8',
    )
    expect(readBackupManifest(bundleRoot)?.dbPath).toBe('toolman.db')
  })

  it('rejects invalid restore paths', async () => {
    const { assertValidRestoreBackupPath, restoreAppData } = await import('./app-storage.service')

    expect(() => assertValidRestoreBackupPath('/missing/backup')).toThrow('备份路径不存在')

    const invalidDir = join(bundleRoot, 'invalid-bundle')
    mkdirSync(invalidDir)
    expect(() => assertValidRestoreBackupPath(invalidDir)).toThrow('不是有效的 Toolman 备份包')

    const badManifestDir = join(bundleRoot, 'bad-manifest')
    mkdirSync(badManifestDir)
    writeFileSync(join(badManifestDir, 'manifest.json'), '{"version":99}', 'utf8')
    writeFileSync(join(badManifestDir, 'toolman.db'), 'sqlite', 'utf8')
    expect(() => assertValidRestoreBackupPath(badManifestDir)).toThrow('manifest.json 无效或缺失')

    const validBundle = join(bundleRoot, 'valid-bundle')
    mkdirSync(validBundle)
    writeFileSync(join(validBundle, 'toolman.db'), 'sqlite', 'utf8')
    writeFileSync(
      join(validBundle, 'manifest.json'),
      JSON.stringify({
        version: 1,
        createdAt: Date.now(),
        includesKnowledge: false,
        includesNotes: false,
        dbPath: 'toolman.db',
        knowledgePath: null,
        notesPath: null,
      }),
      'utf8',
    )
    expect(() => assertValidRestoreBackupPath(validBundle)).not.toThrow()

    await expect(restoreAppData({ backupPath: '/missing/backup' })).rejects.toThrow('备份路径不存在')
  })

  it('restores from a validated bundle into userData', async () => {
    const validBundle = join(bundleRoot, 'restore-bundle')
    mkdirSync(validBundle)
    writeFileSync(join(validBundle, 'toolman.db'), 'restored-db', 'utf8')
    writeFileSync(
      join(validBundle, 'manifest.json'),
      JSON.stringify({
        version: 1,
        createdAt: Date.now(),
        includesKnowledge: false,
        includesNotes: false,
        dbPath: 'toolman.db',
        knowledgePath: null,
        notesPath: null,
      }),
      'utf8',
    )

    const { restoreAppData } = await import('./app-storage.service')
    const result = await restoreAppData({ backupPath: validBundle })

    expect(result).toEqual({
      restored: true,
      includesKnowledge: false,
      notesDataJson: undefined,
      requiresRestart: true,
    })
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(USER_DATA, 'toolman.db'), 'utf8')).toBe('restored-db')
  })
})
