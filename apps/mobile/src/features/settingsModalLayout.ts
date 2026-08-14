import { useWindowDimensions } from 'react-native'

/** Shared size for page settings dialogs (agent / group / classroom / module). */
export function useSettingsModalSize(): { width: number; height: number } {
  const { width, height } = useWindowDimensions()
  return {
    width: Math.min(760, Math.max(320, width - 32)),
    height: Math.min(540, Math.max(360, height - 32)),
  }
}
