import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IpcChannel,
  parseAssistantLibSessionMeta,
  parseSocraticState,
  type KnowledgeCourseOutlineEntry,
  type KnowledgeIngestStreamEvent,
  type Session,
} from '@toolman/shared'

export type CourseChapter = {
  id: string
  title: string
  label: string
  level?: number
  documentId?: string
}

/** Front-matter titles that should never appear as sidebar chapter menus. */
export function isSidebarChapterNoise(title: string): boolean {
  const cleaned = title
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\.[A-Za-z0-9]{1,8}$/i, '')
    .replace(/[《》〈〉【】\[\]（）()「」『』"'“”‘’]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
  if (!cleaned) return true
  return /^(封面|封面页|封面图|封底|封底页|版权页?|目录|目录页|目次|contents|tableofcontents|toc|索引|前言|序言|序|跋|内封|cover)$/i.test(
    cleaned,
  )
}

export function resolveCourseKbId(session: Session): string | null {
  const meta = parseAssistantLibSessionMeta(session.metadata)
  return meta?.kbIds?.[0] ?? null
}

/** Prefer the chapter currently being studied (topic / path), else the first real chapter. */
export function resolveLearningChapterId(
  session: Session,
  chapters: CourseChapter[],
): string | null {
  if (chapters.length === 0) return null
  const state = parseSocraticState(session.metadata)
  const pathIndex = state.pathIndex ?? Math.max(0, state.pathNodes.length - 1)
  const hints = [
    state.pathNodes[pathIndex],
    state.topic,
    ...[...state.pathNodes].reverse(),
  ]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))

  for (const hint of hints) {
    const matched = chapters.find((chapter) => {
      const title = chapter.title.trim()
      const label = chapter.label.trim()
      return (
        title === hint ||
        label === hint ||
        title.includes(hint) ||
        hint.includes(title) ||
        label.includes(hint) ||
        hint.includes(label)
      )
    })
    if (matched) return matched.id
  }
  return chapters[0]?.id ?? null
}

export function useAssistantLibCourseCatalog(
  workspaceId: string | null,
  sessions: Session[],
) {
  const kbIds = useMemo(() => {
    const ids = sessions
      .map((session) => resolveCourseKbId(session))
      .filter((id): id is string => Boolean(id))
    return [...new Set(ids)].sort()
  }, [sessions])

  const kbIdsKey = kbIds.join('|')
  const [outlineByKbId, setOutlineByKbId] = useState<
    Record<string, KnowledgeCourseOutlineEntry[]>
  >({})
  const [loadingKbIds, setLoadingKbIds] = useState<Set<string>>(() => new Set())
  const [errorsByKbId, setErrorsByKbId] = useState<Record<string, string>>({})
  const outlineRef = useRef(outlineByKbId)
  outlineRef.current = outlineByKbId

  const loadOutline = useCallback(
    async (kbId: string, force = false) => {
      if (!workspaceId || !kbId) return
      if (!force && outlineRef.current[kbId]) return

      setLoadingKbIds((prev) => {
        const next = new Set(prev)
        next.add(kbId)
        return next
      })
      setErrorsByKbId((prev) => {
        if (!(kbId in prev)) return prev
        const next = { ...prev }
        delete next[kbId]
        return next
      })

      const result = await window.api.invoke(IpcChannel.KnowledgeCourseOutline, {
        workspaceId,
        kbId,
      })

      setLoadingKbIds((prev) => {
        const next = new Set(prev)
        next.delete(kbId)
        return next
      })

      if (!result.ok) {
        setErrorsByKbId((prev) => ({ ...prev, [kbId]: result.error.message }))
        return
      }

      const data = result.data as {
        items: KnowledgeCourseOutlineEntry[]
        fromContent: boolean
      }
      setOutlineByKbId((prev) => ({ ...prev, [kbId]: data.items }))
    },
    [workspaceId],
  )

  useEffect(() => {
    if (!workspaceId || !kbIdsKey) {
      setOutlineByKbId({})
      setErrorsByKbId({})
      return
    }
    for (const kbId of kbIdsKey.split('|').filter(Boolean)) {
      void loadOutline(kbId, true)
    }
  }, [kbIdsKey, loadOutline, workspaceId])

  useEffect(() => {
    if (!workspaceId || !kbIdsKey) return
    const tracked = new Set(kbIdsKey.split('|').filter(Boolean))
    return window.api.subscribe(IpcChannel.KnowledgeIngestStream, (payload) => {
      const event = payload as KnowledgeIngestStreamEvent
      if (event.workspaceId !== workspaceId) return
      if (!tracked.has(event.kbId)) return
      if (event.type !== 'document.stage') return
      if (event.stage === 'ready' || event.stage === 'indexing' || event.stage === 'failed') {
        void loadOutline(event.kbId, true)
      }
    })
  }, [kbIdsKey, loadOutline, workspaceId])

  const chaptersForSession = useCallback(
    (session: Session): CourseChapter[] => {
      const kbId = resolveCourseKbId(session)
      if (!kbId) return []
      const items = outlineByKbId[kbId] ?? []
      return items
        .filter((item) => !isSidebarChapterNoise(item.title) && !isSidebarChapterNoise(item.label))
        .map((item) => ({
          id: item.id,
          title: item.title,
          label: item.label,
          level: item.level,
          documentId: item.documentId,
        }))
    },
    [outlineByKbId],
  )

  const isLoadingSession = useCallback(
    (session: Session): boolean => {
      const kbId = resolveCourseKbId(session)
      return Boolean(kbId && loadingKbIds.has(kbId))
    },
    [loadingKbIds],
  )

  const errorForSession = useCallback(
    (session: Session): string | null => {
      const kbId = resolveCourseKbId(session)
      if (!kbId) return null
      return errorsByKbId[kbId] ?? null
    },
    [errorsByKbId],
  )

  return {
    chaptersForSession,
    isLoadingSession,
    errorForSession,
  }
}
