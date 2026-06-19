import { useCallback, useEffect, useState } from 'react'
import {
  IpcChannel,
  type KnowledgeDocument,
  type KnowledgeIngestStreamEvent,
} from '@toolman/shared'
import { isKnowledgeDocProcessing } from './knowledge-file-display'

export function useKnowledgeDocuments(workspaceId: string | null, kbId: string | null) {
  const [items, setItems] = useState<KnowledgeDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId || !kbId) {
      setItems([])
      return
    }

    setLoading(true)
    setError(null)
    const result = await window.api.invoke(IpcChannel.KnowledgeDocumentList, {
      workspaceId,
      kbId,
    })
    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { items: KnowledgeDocument[] }
    setItems(data.items)
  }, [workspaceId, kbId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!workspaceId || !kbId) return

    const unsubscribe = window.api.subscribe(
      IpcChannel.KnowledgeIngestStream,
      (payload) => {
        const event = payload as KnowledgeIngestStreamEvent
        if (event.workspaceId !== workspaceId || event.kbId !== kbId) return
        if (event.type !== 'document.stage') return

        setItems((current) => {
          const index = current.findIndex((item) => item.id === event.documentId)
          if (index < 0) {
            void load()
            return current
          }

          const next = [...current]
          next[index] = {
            ...next[index]!,
            status: event.stage,
            errorMessage: event.errorMessage ?? next[index]!.errorMessage,
            updatedAt: Date.now(),
          }
          return next
        })

        if (event.stage === 'ready' || event.stage === 'failed') {
          void load()
        }
      },
    )

    return unsubscribe
  }, [workspaceId, kbId, load])

  const hasProcessingDocs = items.some((item) => isKnowledgeDocProcessing(item.status))

  useEffect(() => {
    setIngesting(hasProcessingDocs)
  }, [hasProcessingDocs])

  const ingestFiles = useCallback(
    async (filePaths: string[]) => {
      if (!workspaceId || !kbId || filePaths.length === 0) return null

      setError(null)
      const result = await window.api.invoke(IpcChannel.KnowledgeDocumentIngest, {
        workspaceId,
        kbId,
        filePaths,
      })

      if (!result.ok) {
        setError(result.error.message)
        return null
      }

      await load()
      return result.data as {
        ingested: number
        skipped: number
        queued?: number
        failed: Array<{ path: string; message: string }>
      }
    },
    [workspaceId, kbId, load],
  )

  const remove = useCallback(
    async (documentId: string) => {
      if (!workspaceId || !kbId) return false

      setError(null)
      const result = await window.api.invoke(IpcChannel.KnowledgeDocumentDelete, {
        workspaceId,
        kbId,
        documentId,
      })

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      await load()
      return true
    },
    [workspaceId, kbId, load],
  )

  const reindex = useCallback(
    async (documentId: string) => {
      if (!workspaceId || !kbId) return null

      setError(null)
      const result = await window.api.invoke(IpcChannel.KnowledgeDocumentReindex, {
        workspaceId,
        kbId,
        documentId,
      })

      if (!result.ok) {
        setError(result.error.message)
        return null
      }

      await load()
      return result.data as { outcome: string; message?: string }
    },
    [workspaceId, kbId, load],
  )

  const reindexAll = useCallback(async () => {
    if (!workspaceId || !kbId) return null

    setError(null)
    const result = await window.api.invoke(IpcChannel.KnowledgeKbReindex, {
      workspaceId,
      kbId,
    })

    if (!result.ok) {
      setError(result.error.message)
      return null
    }

    await load()
    return result.data as {
      ingested: number
      skipped: number
      failed: Array<{ path: string; message: string }>
      total: number
    }
  }, [workspaceId, kbId, load])

  return {
    items,
    loading,
    ingesting,
    error,
    setError,
    load,
    ingestFiles,
    remove,
    reindex,
    reindexAll,
  }
}
