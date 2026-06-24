import {
  useRegisterModulePanelError,
  useRegisterModulePanelStatus,
} from '../../components/module-page-status'

export function useCommunityPanelStatus(
  panelKey: string,
  options: {
    loading?: boolean
    error?: string | null
    onClearError?: () => void
    loadingMessage?: string
  } = {},
) {
  useRegisterModulePanelError(panelKey, options.error ?? null, options.onClearError)
  useRegisterModulePanelStatus(
    `${panelKey}:loading`,
    options.loading
      ? { tone: 'info', message: options.loadingMessage ?? '加载中…' }
      : null,
  )
}
