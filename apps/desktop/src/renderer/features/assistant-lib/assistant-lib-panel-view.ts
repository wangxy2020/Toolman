import { useSyncExternalStore } from 'react'

export type AssistantLibPanelView = 'agent' | 'records'

let panelView: AssistantLibPanelView = 'agent'
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function getAssistantLibPanelView(): AssistantLibPanelView {
  return panelView
}

export function setAssistantLibPanelView(view: AssistantLibPanelView): void {
  if (panelView === view) return
  panelView = view
  emit()
}

export function subscribeAssistantLibPanelView(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAssistantLibPanelView(): AssistantLibPanelView {
  return useSyncExternalStore(subscribeAssistantLibPanelView, getAssistantLibPanelView)
}
