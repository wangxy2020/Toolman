import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ModulePanelStatusTone = 'error' | 'warning' | 'info' | 'muted'

export interface ModulePanelStatusEntry {
  tone: ModulePanelStatusTone
  message: string
  onDismiss?: () => void
}

interface ModulePageStatusContextValue {
  panelStatuses: Record<string, ModulePanelStatusEntry>
  registerPanelStatus: (key: string, entry: ModulePanelStatusEntry | null) => void
}

const ModulePageStatusContext = createContext<ModulePageStatusContextValue | null>(null)

export function ModulePageStatusProvider({ children }: { children: ReactNode }) {
  const [panelStatuses, setPanelStatuses] = useState<Record<string, ModulePanelStatusEntry>>({})

  const registerPanelStatus = useCallback((key: string, entry: ModulePanelStatusEntry | null) => {
    setPanelStatuses((current) => {
      if (!entry) {
        if (!(key in current)) return current
        const next = { ...current }
        delete next[key]
        return next
      }

      const existing = current[key]
      if (
        existing?.message === entry.message &&
        existing.tone === entry.tone &&
        existing.onDismiss === entry.onDismiss
      ) {
        return current
      }

      return { ...current, [key]: entry }
    })
  }, [])

  const value = useMemo(
    () => ({ panelStatuses, registerPanelStatus }),
    [panelStatuses, registerPanelStatus],
  )

  return (
    <ModulePageStatusContext.Provider value={value}>
      {children}
    </ModulePageStatusContext.Provider>
  )
}

function useModulePageStatusContext() {
  const context = useContext(ModulePageStatusContext)
  if (!context) {
    throw new Error('useModulePageStatusContext must be used within ModulePageStatusProvider')
  }
  return context
}

export function useRegisterModulePanelStatus(
  panelKey: string,
  entry: ModulePanelStatusEntry | null | undefined,
  onDismiss?: () => void,
) {
  const { registerPanelStatus } = useModulePageStatusContext()
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (entry?.message) {
      registerPanelStatus(panelKey, {
        tone: entry.tone,
        message: entry.message,
        onDismiss: onDismiss ? () => onDismissRef.current?.() : entry.onDismiss,
      })
      return () => registerPanelStatus(panelKey, null)
    }

    registerPanelStatus(panelKey, null)
    return undefined
  }, [entry?.message, entry?.tone, onDismiss, panelKey, registerPanelStatus])
}

export function useRegisterModulePanelError(
  panelKey: string,
  error: string | null | undefined,
  onDismiss?: () => void,
) {
  useRegisterModulePanelStatus(
    panelKey,
    error ? { tone: 'error', message: error } : null,
    onDismiss,
  )
}

export function useModulePagePanelStatuses() {
  return useModulePageStatusContext().panelStatuses
}
