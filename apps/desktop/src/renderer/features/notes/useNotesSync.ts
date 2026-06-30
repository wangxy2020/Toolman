import { useEffect } from 'react'
import { IpcChannel, type WorkspaceEvent } from '@toolman/shared'
import { isGroupNotebookId } from '../group/group-note-utils'
import { loadSystemPaths } from '../chat/useSystemPaths'
import { markdownToBlocks } from './notes-blocks'
import { readNoteUpdatedContent, readNoteUpdatedNoteId, readNoteUpdatedPermission } from './p2p-note-events'
import { syncNotesToFolder } from './notes-import-export'
import { fetchGroupNotePlacements } from './fetch-group-note-placements'
import { reconcileGroupSharedNotesInData } from './notes-group-placement'
import { resolveNotesWorkingDirectory } from './notes-path-utils'
import {
  DEFAULT_NOTEBOOK_ID,
  getFirstNoteInNotebook,
  loadNotesData,
  mergeNotesData,
  normalizeData,
  normalizeNote,
  saveNotesData,
  type NotesData,
} from './notes-storage'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

type UseNotesSyncParams = {
  data: NotesData
  setData: Dispatch<SetStateAction<NotesData>>
  hydrated: boolean
  setHydrated: Dispatch<SetStateAction<boolean>>
  activeNoteIdRef: MutableRefObject<string | null>
  setActiveNoteId: Dispatch<SetStateAction<string | null>>
  importNotesBackup: (raw: string) => void
}

async function mergeNotesFromMain(localData: NotesData): Promise<NotesData> {
  const loadResult = await window.api.invoke(IpcChannel.NotesDataLoad, {})
  let nextData = localData
  if (loadResult.ok) {
    const payload = loadResult.data as { dataJson: string }
    try {
      const mainData = normalizeData(JSON.parse(payload.dataJson) as Partial<NotesData>)
      nextData = mergeNotesData(localData, mainData)
    } catch {
      nextData = localData
    }
  }
  return nextData
}

async function reconcileNotesPlacement(data: NotesData): Promise<NotesData> {
  const { placements, selfMemberIdByWorkspace } = await fetchGroupNotePlacements()
  return reconcileGroupSharedNotesInData(data, placements, selfMemberIdByWorkspace)
}

async function syncAndReloadNotes(data: NotesData): Promise<NotesData> {
  await window.api.invoke(IpcChannel.NotesDataSync, {
    dataJson: JSON.stringify(data),
  })
  const loadResult = await window.api.invoke(IpcChannel.NotesDataLoad, {})
  if (!loadResult.ok) return data
  try {
    return normalizeData(JSON.parse((loadResult.data as { dataJson: string }).dataJson) as Partial<NotesData>)
  } catch {
    return data
  }
}

export function useNotesSync({
  data,
  setData,
  hydrated,
  setHydrated,
  activeNoteIdRef,
  setActiveNoteId,
  importNotesBackup,
}: UseNotesSyncParams) {
  useEffect(() => {
    const handleP2pNoteEvent = (payload: unknown) => {
      const event = payload as WorkspaceEvent
      if (event.resourceType !== 'Note') return

      if (event.eventType === 'Shared' || event.eventType === 'Created') {
        void (async () => {
          const localData = loadNotesData()
          let nextData = await mergeNotesFromMain(localData)
          nextData = await reconcileNotesPlacement(nextData)
          nextData = await syncAndReloadNotes(nextData)
          setData(nextData)
        })()
        return
      }

      if (event.eventType !== 'Updated') return

      const noteId = readNoteUpdatedNoteId(event)
      if (!noteId) return

      const permission = readNoteUpdatedPermission(event)
      if (permission) {
        const groupPermissionLocked = permission === 'read'
        setData((prev) => {
          const target = prev.notes.find((item) => item.id === noteId)
          if (
            !target ||
            !isGroupNotebookId(target.notebookId) ||
            (target.locked === groupPermissionLocked &&
              target.groupPermissionLocked === groupPermissionLocked)
          ) {
            return prev
          }
          return {
            ...prev,
            notes: prev.notes.map((item) =>
              item.id === noteId
                ? {
                    ...item,
                    locked: groupPermissionLocked,
                    groupPermissionLocked,
                    updatedAt: Date.now(),
                  }
                : item,
            ),
          }
        })
        return
      }

      const merged = readNoteUpdatedContent(event)
      if (merged == null) return
      if (noteId === activeNoteIdRef.current) return

      setData((prev) => {
        const target = prev.notes.find((item) => item.id === noteId)
        if (!target || target.content === merged) return prev

        const withContent = {
          ...prev,
          notes: prev.notes.map((item) => {
            if (item.id !== noteId) return item
            return normalizeNote(
              {
                ...item,
                content: merged,
                blocks: item.editorMode === 'blocks' ? markdownToBlocks(merged) : item.blocks,
                updatedAt: Math.max(item.updatedAt, event.timestamp),
              },
              item.notebookId,
            )
          }),
        }
        return withContent
      })

      void (async () => {
        const { placements, selfMemberIdByWorkspace } = await fetchGroupNotePlacements()
        setData((prev) => reconcileGroupSharedNotesInData(prev, placements, selfMemberIdByWorkspace))
      })()
    }

    const unsubscribeAppended = window.api.subscribe('p2p:event:appended', handleP2pNoteEvent)
    const unsubscribeSynced = window.api.subscribe('p2p:sync:event-applied', handleP2pNoteEvent)

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
    }
  }, [activeNoteIdRef, setData])

  useEffect(() => {
    if (!hydrated) return
    saveNotesData(data)
    void loadSystemPaths().then((paths) => {
      const folder = resolveNotesWorkingDirectory(data.syncFolderPath, paths)
      if (folder) {
        void syncNotesToFolder(folder, data)
      }
    })
  }, [data, hydrated])

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hydrated) saveNotesData(data)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [data, hydrated])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const localData = loadNotesData()
      if (cancelled) return

      let nextData = await mergeNotesFromMain(localData)
      nextData = await reconcileNotesPlacement(nextData)
      nextData = await syncAndReloadNotes(nextData)
      if (cancelled) return

      setData(nextData)
      setActiveNoteId((prev) => {
        if (prev && nextData.notes.some((item) => item.id === prev)) return prev
        return getFirstNoteInNotebook(nextData.notes, DEFAULT_NOTEBOOK_ID)?.id ?? null
      })
      setHydrated(true)
    })()

    return () => {
      cancelled = true
    }
  }, [setActiveNoteId, setData, setHydrated])

  useEffect(() => {
    const handleRestore = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string' && detail.trim()) {
        importNotesBackup(detail)
      }
    }
    window.addEventListener('toolman:notes-restore', handleRestore)
    return () => window.removeEventListener('toolman:notes-restore', handleRestore)
  }, [importNotesBackup, setActiveNoteId])
}
