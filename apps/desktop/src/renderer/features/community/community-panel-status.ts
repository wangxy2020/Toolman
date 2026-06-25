import {
  useRegisterModulePanelError,
  useRegisterModulePanelStatus,
} from '../../components/module-page-status'
import { useI18n } from '../../i18n/useI18n'

export function useCommunityPanelStatus(
  panelKey: string,
  options: {
    loading?: boolean
    error?: string | null
    onClearError?: () => void
    loadingMessage?: string
  } = {},
) {
  const { t } = useI18n()
  useRegisterModulePanelError(panelKey, options.error ?? null, options.onClearError)
  useRegisterModulePanelStatus(
    `${panelKey}:loading`,
    options.loading
      ? { tone: 'info', message: options.loadingMessage ?? t('common.loading') }
      : null,
  )
}
