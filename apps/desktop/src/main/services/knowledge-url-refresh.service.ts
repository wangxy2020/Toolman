import {
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  KnowledgeWatchConfigSchema,
} from '@toolman/shared'
import { logStructured } from './structured-log.service'
import { listWorkspaces } from './workspace.service'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { ingestUrlDocument, refreshKbStats } from './knowledge-ingest.service'

const CHECK_INTERVAL_MS = 30 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null

function parseWatchConfig(json: string) {
  try {
    return KnowledgeWatchConfigSchema.parse(JSON.parse(json))
  } catch {
    return DEFAULT_KNOWLEDGE_WATCH_CONFIG
  }
}

async function refreshNetworkKnowledgeBaseUrls(
  workspaceId: string,
  kbId: string,
  watchConfig: ReturnType<typeof parseWatchConfig>,
) {
  const kbRepo = getKnowledgeBaseRepository()
  const docRepo = getDocumentRepository()
  const urlDocs = docRepo.listUrlDocumentsByKb(kbId)

  if (urlDocs.length === 0) return

  kbRepo.update({
    id: kbId,
    workspaceId,
    status: 'indexing',
  })

  let failed = 0
  for (const doc of urlDocs) {
    if (!doc.absolutePath) continue
    try {
      const result = await ingestUrlDocument({
        workspaceId,
        kbId,
        url: doc.absolutePath,
        sourceId: doc.sourceId,
      })
      if (result.outcome === 'failed') failed += 1
    } catch (error) {
      failed += 1
      logStructured('knowledge', 'error', `scheduled URL refresh failed`, { detail: doc.absolutePath, error })
    }
  }

  const nextWatchConfig = {
    ...watchConfig,
    lastUrlRefreshAt: Date.now(),
  }
  kbRepo.update({
    id: kbId,
    workspaceId,
    watchConfigJson: JSON.stringify(nextWatchConfig),
    status: failed > 0 ? 'error' : 'idle',
  })
  refreshKbStats(workspaceId, kbId)
}

async function runUrlRefreshCheck() {
  const kbRepo = getKnowledgeBaseRepository()

  const now = Date.now()
  for (const workspace of listWorkspaces()) {
    const kbs = kbRepo.listByWorkspace(workspace.id).filter((kb) => kb.kind === 'network')
    for (const kb of kbs) {
      const watchConfig = parseWatchConfig(kb.watchConfigJson)
      const intervalHours = watchConfig.urlRefreshIntervalHours ?? 0
      if (intervalHours <= 0) continue

      const lastRefresh = watchConfig.lastUrlRefreshAt ?? 0
      const dueMs = intervalHours * 60 * 60 * 1000
      if (now - lastRefresh < dueMs) continue

      try {
        await refreshNetworkKnowledgeBaseUrls(kb.workspaceId, kb.id, watchConfig)
      } catch (error) {
        logStructured('knowledge', 'error', `URL refresh scheduler failed for kb`, { detail: kb.id, error })
      }
    }
  }
}

export function startKnowledgeUrlRefreshScheduler() {
  if (timer) return

  void runUrlRefreshCheck()
  timer = setInterval(() => {
    void runUrlRefreshCheck()
  }, CHECK_INTERVAL_MS)
}

export function stopKnowledgeUrlRefreshScheduler() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
