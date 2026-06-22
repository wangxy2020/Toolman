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

interface PanelErrorEntry {
  message: string
  onDismiss?: () => void
}

interface GroupPageStatusContextValue {
  panelErrors: Record<string, PanelErrorEntry>
  registerPanelError: (key: string, message: string, onDismiss?: () => void) => void
  unregisterPanelError: (key: string) => void
}

const GroupPageStatusContext = createContext<GroupPageStatusContextValue | null>(null)

export function GroupPageStatusProvider({ children }: { children: ReactNode }) {
  const [panelErrors, setPanelErrors] = useState<Record<string, PanelErrorEntry>>({})

  const registerPanelError = useCallback(
    (key: string, message: string, onDismiss?: () => void) => {
      setPanelErrors((current) => {
        const existing = current[key]
        if (existing?.message === message && existing.onDismiss === onDismiss) {
          return current
        }
        return { ...current, [key]: { message, onDismiss } }
      })
    },
    [],
  )

  const unregisterPanelError = useCallback((key: string) => {
    setPanelErrors((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ panelErrors, registerPanelError, unregisterPanelError }),
    [panelErrors, registerPanelError, unregisterPanelError],
  )

  return (
    <GroupPageStatusContext.Provider value={value}>
      {children}
    </GroupPageStatusContext.Provider>
  )
}

function useGroupPageStatusContext() {
  const context = useContext(GroupPageStatusContext)
  if (!context) {
    throw new Error('useGroupPageStatusContext must be used within GroupPageStatusProvider')
  }
  return context
}

export function useRegisterGroupPanelError(
  panelKey: string,
  error: string | null | undefined,
  onDismiss?: () => void,
) {
  const { registerPanelError, unregisterPanelError } = useGroupPageStatusContext()
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (error) {
      registerPanelError(panelKey, error, () => onDismissRef.current?.())
      return () => unregisterPanelError(panelKey)
    }
    unregisterPanelError(panelKey)
    return undefined
  }, [error, panelKey, registerPanelError, unregisterPanelError])
}

export function useGroupPagePanelErrors() {
  return useGroupPageStatusContext().panelErrors
}
