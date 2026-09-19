import {
  ingestUrlDocument,
  reconcileProcessingDocumentsWithoutIngestJob,
  recoverInterruptedIngestJobsOnStartup,
  refreshKbStats,
  recoverStaleIngestJobs,
  restoreIndexedDocumentsNotInFlight,
  startIngestFilePathsInBackground,
} from './knowledge-ingest.service'
import { logStructured } from './structured-log.service'
import { getDocumentRepository } from '../db/repos'
import { isIngestInFlight } from './knowledge-ingest-manager.service'
import { PARSE_INCOMPLETE_INGEST_STAGES } from './knowledge-ingest-shared'

function isUrlPath(path: string | null | undefined): boolean {
  if (!path) return false
  return path.startsWith('http://') || path.startsWith('https://')
}

export function resumePendingIngestJobs(): void {
  const repo = getDocumentRepository()
  restoreIndexedDocumentsNotInFlight()
  recoverInterruptedIngestJobsOnStartup()
  reconcileProcessingDocumentsWithoutIngestJob()
  recoverStaleIngestJobs()
  const pending = repo.listResumableDocuments()

  if (pending.length === 0) return

  const fileJobsByKb = new Map<string, { workspaceId: string; kbId: string; paths: string[] }>()
  const urlJobs: Array<{ workspaceId: string; kbId: string; url: string; sourceId: string | null }> =
    []

  for (const { job, document } of pending) {
    if (isIngestInFlight(document.id)) continue
    if (
      repo.countChunksByDocument(document.id, job.kbId) > 0 &&
      !PARSE_INCOMPLETE_INGEST_STAGES.has(job.stage)
    ) {
      continue
    }
    const path = document.absolutePath
    if (!path) continue

    if (isUrlPath(path)) {
      urlJobs.push({
        workspaceId: job.workspaceId,
        kbId: job.kbId,
        url: path,
        sourceId: document.sourceId,
      })
      continue
    }

    const key = `${job.workspaceId}:${job.kbId}`
    const existing = fileJobsByKb.get(key)
    if (existing) {
      existing.paths.push(path)
    } else {
      fileJobsByKb.set(key, {
        workspaceId: job.workspaceId,
        kbId: job.kbId,
        paths: [path],
      })
    }
  }

  for (const group of fileJobsByKb.values()) {
    startIngestFilePathsInBackground({
      workspaceId: group.workspaceId,
      kbId: group.kbId,
      filePaths: group.paths,
    })
  }

  if (urlJobs.length > 0) {
    void (async () => {
      for (const job of urlJobs) {
        try {
          await ingestUrlDocument({
            workspaceId: job.workspaceId,
            kbId: job.kbId,
            url: job.url,
            sourceId: job.sourceId,
          })
          refreshKbStats(job.workspaceId, job.kbId)
        } catch (error) {
          logStructured('knowledge', 'error', `resume URL ingest failed`, { detail: job.url, error })
        }
      }
    })()
  }

  logStructured('knowledge', 'info', `resumed ${fileJobsByKb.size} file ingest batches and ${urlJobs.length} URL jobs`)
}
