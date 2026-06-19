import { useCallback, useEffect, useRef } from 'react'
import { IpcChannel, type WorkspaceEvent } from '@toolman/shared'
import { readNoteUpdatedContent, readNoteUpdatedNoteId } from './p2p-note-events'

const PUSH_DEBOUNCE_MS = 300

interface Options {
  noteId: string | null
  content: string
  onRemoteContent: (content: string) => void
}

export function useLoroNoteSync({ noteId, content, onRemoteContent }: Options) {
  const workspaceIdsRef = useRef<string[]>([])
  const pushTimerRef = useRef<number | null>(null)
  const applyingRemoteRef = useRef(false)
  const lastContentRef = useRef(content)
  const onRemoteContentRef = useRef(onRemoteContent)

  useEffect(() => {
    onRemoteContentRef.current = onRemoteContent
  }, [onRemoteContent])

  useEffect(() => {
    lastContentRef.current = content
  }, [content])

  useEffect(() => {
    if (!noteId) {
      workspaceIdsRef.current = []
      return
    }

    let cancelled = false

    void window.api
      .invoke(IpcChannel.P2pNoteListShareTargets, { noteId })
      .then((result) => {
        if (cancelled || !result.ok) return
        const data = result.data as { workspaceIds: string[] }
        workspaceIdsRef.current = data.workspaceIds
      })

    return () => {
      cancelled = true
    }
  }, [noteId])

  const flushPush = useCallback(async () => {
    if (!noteId || workspaceIdsRef.current.length === 0 || applyingRemoteRef.current) return

    for (const workspaceId of workspaceIdsRef.current) {
      const result = await window.api.invoke(IpcChannel.P2pNotePushUpdate, {
        workspaceId,
        noteId,
        content: lastContentRef.current,
      })
      if (!result.ok && result.error.message === '笔记内容未变化') {
        continue
      }
    }
  }, [noteId])

  const schedulePush = useCallback(() => {
    if (!noteId || applyingRemoteRef.current) return
    if (pushTimerRef.current) {
      window.clearTimeout(pushTimerRef.current)
    }
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null
      void flushPush()
    }, PUSH_DEBOUNCE_MS)
  }, [flushPush, noteId])

  useEffect(() => {
    if (!noteId) return
    schedulePush()
  }, [content, noteId, schedulePush])

  useEffect(() => {
    if (!noteId) return

    const handleEvent = (payload: unknown) => {
      const event = payload as WorkspaceEvent
      if (event.resourceType !== 'Note' || event.eventType !== 'Updated') return
      const payloadNoteId = readNoteUpdatedNoteId(event)
      if (payloadNoteId !== noteId) return
      if (!workspaceIdsRef.current.includes(event.workspaceId)) return

      const merged = readNoteUpdatedContent(event)
      if (merged == null || merged === lastContentRef.current) return

      applyingRemoteRef.current = true
      lastContentRef.current = merged
      onRemoteContentRef.current(merged)
      window.setTimeout(() => {
        applyingRemoteRef.current = false
      }, 0)
    }

    const unsubscribeAppended = window.api.subscribe('p2p:event:appended', handleEvent)
    const unsubscribeSynced = window.api.subscribe('p2p:sync:event-applied', handleEvent)

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
      if (pushTimerRef.current) {
        window.clearTimeout(pushTimerRef.current)
      }
    }
  }, [noteId])
}
