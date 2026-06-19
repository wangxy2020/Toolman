import {
  ingestUrlDocument,
  refreshKbStats,
  recoverStaleIngestJobs,
  startIngestFilePathsInBackground,
} from './knowledge-ingest.service'
import { getDocumentRepository } from '../db/repos'

function isUrlPath(path: string | null | undefined): boolean {
  if (!path) return false
  return path.startsWith('http://') || path.startsWith('https://')
}

export function resumePendingIngestJobs(): void {
  const repo = getDocumentRepository()
  recoverStaleIngestJobs()
  const pending = repo.listResumableDocuments()

  if (pending.length === 0) return

  const fileJobsByKb = new Map<string, { workspaceId: string; kbId: string; paths: string[] }>()
  const urlJobs: Array<{ workspaceId: string; kbId: string; url: string; sourceId: string | null }> =
    []

  for (const { job, document } of pending) {
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
          console.error('[knowledge] resume URL ingest failed', job.url, error)
        }
      }
    })()
  }

  console.info(
    `[knowledge] resumed ${fileJobsByKb.size} file ingest batches and ${urlJobs.length} URL jobs`,
  )
}
