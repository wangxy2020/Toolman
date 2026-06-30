import { lazy, Suspense } from 'react'

import { ModulePageStatusProvider } from '../../components/module-page-status'
import { useI18n } from '../../i18n/useI18n'
import type { ProjectSidebarMenuTab } from '../project-manager/projectSidebarMenuConfig'

const LazyProjectManagerPage = lazy(() => import('../project-manager'))

interface Props {
  activeTab: ProjectSidebarMenuTab
}

export function ChatPageProjectsView({ activeTab }: Props) {
  const { t } = useI18n()

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
        <LazyProjectManagerPage activeTab={activeTab} />
      </Suspense>
    </ModulePageStatusProvider>
  )
}
