import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_DATA = join(tmpdir(), 'toolman-loro-note-doc-test')

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? USER_DATA : join(USER_DATA, name)),
  },
}))

describe('loro-note-doc', () => {
  const workspaceId = '00000000-0000-4000-8000-000000000001'
  const noteId = 'note-test'

  beforeEach(async () => {
    rmSync(USER_DATA, { recursive: true, force: true })
    mkdtempSync(USER_DATA)
    const mod = await import('./loro-note-doc')
    mod.clearLoroDocCache(workspaceId, noteId)
  })

  afterEach(() => {
    rmSync(USER_DATA, { recursive: true, force: true })
  })

  it('creates, updates, and reads loro text', async () => {
    const {
      createLoroDocFromText,
      getTextFromLoroDoc,
      setLoroDocText,
    } = await import('./loro-note-doc')

    const doc = createLoroDocFromText('hello')
    expect(getTextFromLoroDoc(doc)).toBe('hello')

    setLoroDocText(doc, 'hello')
    expect(getTextFromLoroDoc(doc)).toBe('hello')

    setLoroDocText(doc, 'world')
    expect(getTextFromLoroDoc(doc)).toBe('world')
  })

  it('persists docs and reloads from snapshot', async () => {
    const {
      initLoroDocFromText,
      getLoroDoc,
      getTextFromLoroDoc,
      clearLoroDocCache,
    } = await import('./loro-note-doc')

    initLoroDocFromText(workspaceId, noteId, 'persisted')
    clearLoroDocCache(workspaceId, noteId)

    const reloaded = getLoroDoc(workspaceId, noteId)
    expect(getTextFromLoroDoc(reloaded)).toBe('persisted')
  })

  it('exportPendingLoroOplog returns null after synced edits', async () => {
    const {
      initLoroDocFromText,
      exportPendingLoroOplog,
      markLoroVersionSynced,
      setLoroDocText,
      getLoroDoc,
    } = await import('./loro-note-doc')

    initLoroDocFromText(workspaceId, noteId, 'same')
    const doc = getLoroDoc(workspaceId, noteId)
    setLoroDocText(doc, 'changed')
    const pending = exportPendingLoroOplog(workspaceId, noteId)
    expect(pending).toBeTruthy()

    markLoroVersionSynced(workspaceId, noteId)
    setLoroDocText(doc, 'changed')
    expect(exportPendingLoroOplog(workspaceId, noteId)).toBeNull()
  })

  it('exportLoroOplogBase64 returns update payloads', async () => {
    const {
      createLoroDocFromText,
      exportLoroOplogBase64,
      setLoroDocText,
    } = await import('./loro-note-doc')

    const doc = createLoroDocFromText('hello')
    const full = exportLoroOplogBase64(doc)
    const from = doc.version()
    setLoroDocText(doc, 'world')
    const delta = exportLoroOplogBase64(doc, from)

    expect(full.length).toBeGreaterThan(0)
    expect(delta.length).toBeGreaterThan(0)
  })

  it('applyLoroOplog merges remote updates', async () => {
    const {
      createLoroDocFromText,
      exportLoroOplogBase64,
      initLoroDocFromText,
      applyLoroOplog,
      getTextFromLoroDoc,
      clearLoroDocCache,
    } = await import('./loro-note-doc')

    const remote = createLoroDocFromText('remote')
    const oplog = exportLoroOplogBase64(remote)

    initLoroDocFromText(workspaceId, noteId, '')
    clearLoroDocCache(workspaceId, noteId)

    const merged = applyLoroOplog(workspaceId, noteId, oplog)
    expect(getTextFromLoroDoc(merged)).toBe('remote')
  })

  it('getP2pNotesDir resolves notes path under user data', async () => {
    const { getP2pNotesDir } = await import('./loro-note-doc')
    expect(getP2pNotesDir(workspaceId)).toContain('p2p-workspaces')
    expect(getP2pNotesDir(workspaceId)).toContain(workspaceId)
  })

  it('importLoroOplogBase64 ignores empty payloads', async () => {
    const { createLoroDocFromText, getTextFromLoroDoc, importLoroOplogBase64 } = await import(
      './loro-note-doc'
    )
    const doc = createLoroDocFromText('stable')
    importLoroOplogBase64(doc, '')
    expect(getTextFromLoroDoc(doc)).toBe('stable')
  })

  it('createLoroDocFromText supports empty initial content', async () => {
    const { createLoroDocFromText, getTextFromLoroDoc } = await import('./loro-note-doc')
    expect(getTextFromLoroDoc(createLoroDocFromText(''))).toBe('')
  })

  it('evicts oldest cached docs when cache exceeds limit', async () => {
    const {
      initLoroDocFromText,
      getLoroDoc,
      clearLoroDocCache,
      exportPendingLoroOplog,
    } = await import('./loro-note-doc')

    for (let i = 0; i < 33; i += 1) {
      initLoroDocFromText(workspaceId, `note-${i}`, `text-${i}`)
    }

    clearLoroDocCache(workspaceId, 'note-0')
    getLoroDoc(workspaceId, 'note-0')
    initLoroDocFromText(workspaceId, 'note-0', 'reloaded')

    expect(exportPendingLoroOplog(workspaceId, 'note-32')).toBeNull()
  })
})
