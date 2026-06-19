import { IconPlus } from '../icons'
import { getModulePageConfig } from '../../features/modules/module-config'
import type { ModuleView } from '../../types/app-view'

interface Props {
  view: ModuleView
}

export function ModuleSidebar({ view }: Props) {
  const config = getModulePageConfig(view)

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" disabled title="即将推出">
          <IconPlus />
          {config.addLabel}
        </button>

        <div className="tm-sidebar-list">
          <div className="tm-empty">{config.sidebarEmptyHint}</div>
        </div>
      </div>
    </aside>
  )
}
