/**
 * Mobile counterpart of desktop `ModulePageStatusBar` / `module-page-status`.
 * Used on pages without a chat composer (knowledge, notes, community, projects).
 */
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
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'

export type ModulePanelStatusTone = 'error' | 'warning' | 'info' | 'muted'

export interface ModulePanelStatusEntry {
  tone: ModulePanelStatusTone
  message: string
  meta?: string
  onDismiss?: () => void
}

interface ModulePageStatusContextValue {
  panelStatuses: Record<string, ModulePanelStatusEntry>
  registerPanelStatus: (key: string, entry: ModulePanelStatusEntry | null) => void
}

const ModulePageStatusContext = createContext<ModulePageStatusContextValue | null>(null)

const TONE_PRIORITY: Record<ModulePanelStatusTone, number> = {
  error: 0,
  warning: 1,
  info: 2,
  muted: 3,
}

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
        existing.meta === entry.meta &&
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
    <ModulePageStatusContext.Provider value={value}>{children}</ModulePageStatusContext.Provider>
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
        meta: entry.meta,
        onDismiss: onDismiss ? () => onDismissRef.current?.() : entry.onDismiss,
      })
      return () => registerPanelStatus(panelKey, null)
    }
    registerPanelStatus(panelKey, null)
    return undefined
  }, [
    entry?.message,
    entry?.meta,
    entry?.tone,
    onDismiss,
    panelKey,
    registerPanelStatus,
  ])
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

function pickPanelStatus(
  panelStatuses: Record<string, ModulePanelStatusEntry>,
): ModulePanelStatusEntry | null {
  const entries = Object.values(panelStatuses)
  if (entries.length === 0) return null
  const sorted = [...entries].sort((a, b) => TONE_PRIORITY[a.tone] - TONE_PRIORITY[b.tone])
  return sorted[0] ?? null
}

export function ModulePageStatusBar() {
  const { panelStatuses } = useModulePageStatusContext()
  const status = pickPanelStatus(panelStatuses) ?? {
    tone: 'muted' as const,
    message: '就绪',
  }

  return (
    <View style={styles.bar} accessibilityRole="text">
      <Text
        style={[styles.message, toneStyle(status.tone)]}
        numberOfLines={1}
      >
        {status.message}
      </Text>
      <View style={styles.actions}>
        {status.meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {status.meta}
          </Text>
        ) : null}
        {status.onDismiss ? (
          <Pressable
            onPress={status.onDismiss}
            accessibilityLabel="关闭状态"
            hitSlop={8}
            style={({ pressed }) => [styles.dismiss, pressed ? styles.dismissPressed : null]}
          >
            <Text style={styles.dismissText}>×</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function toneStyle(tone: ModulePanelStatusTone) {
  if (tone === 'error') return styles.messageError
  if (tone === 'warning') return styles.messageWarning
  if (tone === 'info') return styles.messageInfo
  return styles.messageMuted
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    height: 40,
    minHeight: 40,
    maxHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 0,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    flexShrink: 0,
  },
  message: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    fontSize: 13,
    lineHeight: 18,
  },
  messageError: {
    color: colors.danger,
  },
  messageWarning: {
    color: '#b45309',
  },
  messageInfo: {
    color: colors.textSecondary,
  },
  messageMuted: {
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  meta: {
    fontSize: 12,
    color: colors.textSecondary,
    maxWidth: 280,
    flexShrink: 1,
    overflow: 'hidden',
  },
  dismiss: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissPressed: {
    backgroundColor: colors.hover,
  },
  dismissText: {
    fontSize: 16,
    lineHeight: 18,
    color: colors.textSecondary,
  },
})
