import { lazy, Suspense } from 'react'
import { ModulePageStatusProvider } from '../../components/module-page-status'
import { useI18n } from '../../i18n/useI18n'
import type { ChatPageState } from './useChatPage'

const AssistantLibPage = lazy(() => import('../assistant-lib/AssistantLibPage'))

type Props = Pick<
  ChatPageState,
  | 'workspaceId'
  | 'chat'
  | 'messageSettings'
  | 'defaultModelId'
  | 'translationLanguages'
  | 'groupProxyReadOnly'
  | 'appSettings'
  | 'systemPaths'
  | 'agentPrefillText'
  | 'agentPrefillAttachments'
  | 'chatPrefillRevision'
  | 'handleEditUserMessage'
  | 'handlePrefillConsumed'
  | 'updateAppSettings'
  | 'notes'
  | 'setActiveView'
  | 'handleReloadAssistants'
  | 'setStatusMessage'
  | 'knowledgeFolder'
>

export function ChatPageAssistantLibView(props: Props) {
  const { t } = useI18n()
  return (
    <ModulePageStatusProvider>
      <Suspense
        fallback={
          <main className="tm-main">
            <div className="tm-module-empty">
              <p className="tm-module-empty-hint">{t('assistantLibPage.title')}…</p>
            </div>
          </main>
        }
      >
        <AssistantLibPage {...props} />
      </Suspense>
    </ModulePageStatusProvider>
  )
}
