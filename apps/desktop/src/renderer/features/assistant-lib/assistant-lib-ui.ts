import { useSyncExternalStore } from 'react'

type AssistantLibUiState = {
  createCourseOpen: boolean
  settingsOpen: boolean
}

let state: AssistantLibUiState = {
  createCourseOpen: false,
  settingsOpen: false,
}

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function setState(patch: Partial<AssistantLibUiState>): void {
  state = { ...state, ...patch }
  emit()
}

export function openAssistantLibCreateCourse(): void {
  setState({ createCourseOpen: true })
}

export function closeAssistantLibCreateCourse(): void {
  setState({ createCourseOpen: false })
}

export function openAssistantLibSettings(): void {
  setState({ settingsOpen: true })
}

export function closeAssistantLibSettings(): void {
  setState({ settingsOpen: false })
}

export function getAssistantLibUiState(): AssistantLibUiState {
  return state
}

export function subscribeAssistantLibUi(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAssistantLibUiState(): AssistantLibUiState {
  return useSyncExternalStore(subscribeAssistantLibUi, getAssistantLibUiState)
}
