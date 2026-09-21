import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { IpcChannel } from '@toolman/shared'
import type { LocalWorkflowItem } from './workflow-types'

type WorkflowState = {
  items: LocalWorkflowItem[]
  activeId: string | null
  loading: boolean
  error: string | null
}

let state: WorkflowState = {
  items: [],
  activeId: null,
  loading: false,
  error: null,
}

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function setState(patch: Partial<WorkflowState>) {
  state = { ...state, ...patch }
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return state
}

function sortItems(items: LocalWorkflowItem[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

async function fetchWorkflows(): Promise<LocalWorkflowItem[]> {
  const result = await window.api.invoke(IpcChannel.P2pWorkflowListLocal)
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to list workflows')
  }
  const data = result.data as { workflows: LocalWorkflowItem[] }
  return sortItems(data.workflows)
}

async function upsertItem(input: {
  id: string
  name: string
  description?: string
  engine?: string
  parentId?: string | null
  sessionId?: string | null
}): Promise<LocalWorkflowItem> {
  const result = await window.api.invoke(IpcChannel.P2pWorkflowUpsertLocal, input)
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to save workflow')
  }
  return (result.data as { workflow: LocalWorkflowItem }).workflow
}

export function useWorkflows() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const load = useCallback(async () => {
    setState({ loading: true, error: null })
    try {
      const items = await fetchWorkflows()
      const activeId =
        state.activeId && items.some((item) => item.id === state.activeId)
          ? state.activeId
          : (items.find((item) => !item.parentId)?.id ?? null)
      setState({ items, activeId, loading: false, error: null })
    } catch (error) {
      setState({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const select = useCallback((id: string | null) => {
    setState({ activeId: id })
  }, [])

  const createTask = useCallback(async (name: string) => {
    try {
      const workflow = await upsertItem({
        id: crypto.randomUUID(),
        name,
        engine: 'langgraph',
        parentId: null,
      })
      const items = sortItems([
        ...state.items.filter((item) => item.id !== workflow.id),
        workflow,
      ])
      setState({ items, activeId: workflow.id, error: null })
      return workflow
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState({ error: message })
      throw error
    }
  }, [])

  const createSubTask = useCallback(async (parentId: string, name: string, sessionId?: string) => {
    try {
      const workflow = await upsertItem({
        id: crypto.randomUUID(),
        name,
        engine: 'langgraph',
        parentId,
        sessionId: sessionId ?? null,
      })
      const items = sortItems([
        ...state.items.filter((item) => item.id !== workflow.id),
        workflow,
      ])
      setState({ items, activeId: workflow.id, error: null })
      return workflow
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState({ error: message })
      throw error
    }
  }, [])

  const rename = useCallback(async (id: string, name: string) => {
    const existing = state.items.find((item) => item.id === id)
    if (!existing) return
    const trimmed = name.trim() || existing.name
    try {
      const workflow = await upsertItem({
        id,
        name: trimmed,
        description: existing.description,
        engine: existing.engine ?? 'langgraph',
        parentId: existing.parentId ?? null,
        sessionId: existing.sessionId ?? null,
      })
      const items = sortItems(
        state.items.map((item) => (item.id === id ? workflow : item)),
      )
      setState({ items, error: null })
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }, [])

  const updateTask = useCallback(
    async (id: string, patch: { name?: string; description?: string }) => {
      const existing = state.items.find((item) => item.id === id)
      if (!existing) return null
      try {
        const workflow = await upsertItem({
          id,
          name: patch.name?.trim() || existing.name,
          description: patch.description ?? existing.description,
          engine: existing.engine ?? 'langgraph',
          parentId: existing.parentId ?? null,
          sessionId: existing.sessionId ?? null,
        })
        const items = sortItems(
          state.items.map((item) => (item.id === id ? workflow : item)),
        )
        setState({ items, error: null })
        return workflow
      } catch (error) {
        setState({ error: error instanceof Error ? error.message : String(error) })
        return null
      }
    },
    [],
  )

  const linkSession = useCallback(async (id: string, sessionId: string) => {
    const existing = state.items.find((item) => item.id === id)
    if (!existing) return
    try {
      const workflow = await upsertItem({
        id,
        name: existing.name,
        description: existing.description,
        engine: existing.engine ?? 'langgraph',
        parentId: existing.parentId ?? null,
        sessionId,
      })
      const items = sortItems(
        state.items.map((item) => (item.id === id ? workflow : item)),
      )
      setState({ items, error: null })
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    try {
      const result = await window.api.invoke(IpcChannel.P2pWorkflowDeleteLocal, { id })
      if (!result.ok) {
        throw new Error(result.error.message || 'Failed to delete workflow')
      }
      const items = state.items.filter((item) => item.id !== id && item.parentId !== id)
      const activeId = items.some((item) => item.id === state.activeId)
        ? state.activeId
        : (items.find((item) => !item.parentId)?.id ?? null)
      setState({ items, activeId, error: null })
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }, [])

  const tasks = useMemo(
    () => snap.items.filter((item) => !item.parentId),
    [snap.items],
  )

  const childrenByParent = useMemo(() => {
    const map = new Map<string, LocalWorkflowItem[]>()
    for (const item of snap.items) {
      if (!item.parentId) continue
      const list = map.get(item.parentId) ?? []
      list.push(item)
      map.set(item.parentId, list)
    }
    return map
  }, [snap.items])

  const active = snap.items.find((item) => item.id === snap.activeId) ?? null
  const activeTask =
    active == null
      ? null
      : active.parentId
        ? (snap.items.find((item) => item.id === active.parentId) ?? null)
        : active

  return {
    items: snap.items,
    tasks,
    childrenByParent,
    activeId: snap.activeId,
    active,
    activeTask,
    loading: snap.loading,
    error: snap.error,
    load,
    select,
    createTask,
    createSubTask,
    rename,
    updateTask,
    linkSession,
    remove,
  }
}
