import { lazy, Suspense, useMemo } from 'react'

import { ModulePageStatusProvider } from '../../components/module-page-status'
import { useI18n } from '../../i18n/useI18n'
import type { ProjectManagementAgentPanelProps } from '../project-manager/ProjectManagementAgentPanel'
import type { ProjectSidebarMenuTab } from '../project-manager/projectSidebarMenuConfig'

const LazyProjectManagerPage = lazy(() => import('../project-manager'))

export type ChatPageProjectsViewProps = {
  activeTab: ProjectSidebarMenuTab
  agentContext: Omit<ProjectManagementAgentPanelProps, 'activeTab'> | null
}

export function ChatPageProjectsView({ activeTab, agentContext }: ChatPageProjectsViewProps) {
  const { t } = useI18n()
  const pageProps = useMemo(
    () => ({ activeTab, agentContext }),
    [activeTab, agentContext],
  )

  return (
    <ModulePageStatusProvider>
      <Suspense
        fallback={
          <main className="tm-main">
            <div className="tm-module-empty">
              <p className="tm-module-empty-hint">{t('nav.modules.projects')}…</p>
            </div>
          </main>
        }>
        <LazyProjectManagerPage {...pageProps} />
      </Suspense>
    </ModulePageStatusProvider>
  )
}
