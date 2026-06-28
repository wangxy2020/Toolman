import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
  DEFAULT_KNOWLEDGE_EMBED_CONFIG,
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
} from '@toolman/shared'
import type { ToolmanDatabase } from '@toolman/db'
import { createP2pTestDb } from './p2p/p2p-test-db'

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002'
const INTEGRATION_MARKER = 'toolman-ingest-integration-marker-7f3a'

const harness = vi.hoisted(() => ({
  tempUserData: '',
  db: null as ToolmanDatabase | null,
  cleanupDb: () => {},
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return harness.tempUserData
      return join(harness.tempUserData, name)
    },
    getVersion: () => '0.2.0-test',
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}))

vi.mock('../bootstrap/database', () => ({
  getDatabase: () => {
    if (!harness.db) throw new Error('integration test database not initialized')
    return harness.db
  },
}))

vi.mock('./knowledge-watcher.service', () => ({
  restartKnowledgeWatchersForKb: vi.fn(),
  stopKnowledgeWatchersForKb: vi.fn(),
}))

vi.mock('./p2p/knowledge-sync.service', () => ({
  maybeSyncSharedKnowledgeDocument: vi.fn(async () => undefined),
}))

vi.mock('@toolman/knowledge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@toolman/knowledge')>()
  return {
    ...actual,
    embedTexts: vi.fn(async (_options: unknown, texts: string[]) =>
      texts.map((text) => {
        const seed = text.includes(INTEGRATION_MARKER) ? 0.95 : 0.2
        return [seed, 0.5, 0.25]
      }),
    ),
  }
})

describe('knowledge ingest integration', () => {
  beforeEach(() => {
    const { db, cleanup } = createP2pTestDb()
    harness.db = db
    harness.cleanupDb = cleanup
    harness.tempUserData = mkdtempSync(join(tmpdir(), 'toolman-knowledge-ingest-'))
  })

  afterEach(() => {
    harness.cleanupDb()
    rmSync(harness.tempUserData, { recursive: true, force: true })
    harness.db = null
  })

  it('creates KB, ingests markdown, and finds content via FTS search', async () => {
    const { resetChunkFtsRepositoryForTests, getKnowledgeBaseRepository, getDocumentRepository } =
      await import('../db/repos')
    resetChunkFtsRepositoryForTests()

    const { createKnowledgeBase } = await import('./knowledge.service')
    const { ingestFileAtPath } = await import('./knowledge-ingest.service')
    const { searchKnowledge } = await import('./knowledge-document.service')

    const kb = createKnowledgeBase({
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: 'Ingest Integration KB',
      kind: 'local',
      embedConfig: DEFAULT_KNOWLEDGE_EMBED_CONFIG,
      chunkConfig: DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
      watchConfig: DEFAULT_KNOWLEDGE_WATCH_CONFIG,
    })

    const docsDir = mkdtempSync(join(harness.tempUserData, 'docs-'))
    const filePath = join(docsDir, 'integration-note.md')
    writeFileSync(
      filePath,
      `# Integration Note\n\nThis paragraph contains ${INTEGRATION_MARKER} for retrieval.\n`,
      'utf8',
    )

    const ingestResult = await ingestFileAtPath({
      workspaceId: DEFAULT_WORKSPACE_ID,
      kbId: kb.id,
      filePath,
      skipP2pSync: true,
    })

    expect(ingestResult.outcome).toBe('ingested')

    const docRepo = getDocumentRepository()
    const docs = docRepo.listByKb(kb.id)
    expect(docs.some((doc) => doc.status === 'ready')).toBe(true)

    const hits = await searchKnowledge({
      workspaceId: DEFAULT_WORKSPACE_ID,
      kbIds: [kb.id],
      query: INTEGRATION_MARKER,
      topK: 5,
      hybridEnabled: true,
    })

    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((hit) => hit.text.includes(INTEGRATION_MARKER))).toBe(true)

    const kbRow = getKnowledgeBaseRepository().findRowById(kb.id, DEFAULT_WORKSPACE_ID)
    expect(kbRow?.documentCount).toBeGreaterThan(0)
    expect(kbRow?.chunkCount).toBeGreaterThan(0)
  })
})
