import { ModulePageHeader } from '../../components/layout/ModulePageHeader'
import { getModulePageConfig } from './module-config'
import { useI18n } from '../../i18n/useI18n'
import type { ModuleView } from '../../types/app-view'

interface Props {
  view: ModuleView
}

export function ModulePage({ view }: Props) {
  const { t } = useI18n()
  const config = getModulePageConfig(view, t)

  return (
    <main className="tm-main">
      <ModulePageHeader view={view} />

      <div className="tm-module-content">
        <div className="tm-module-empty">
          <h2 className="tm-module-empty-title">{config.contentEmptyTitle}</h2>
          <p className="tm-module-empty-hint">{config.contentEmptyHint}</p>
        </div>
      </div>
    </main>
  )
}
