import { IconSliders } from '../icons'
import { getModulePageConfig } from '../../features/modules/module-config'
import type { ModuleView } from '../../types/app-view'

interface Props {
  view: ModuleView
}

export function ModulePageHeader({ view }: Props) {
  const config = getModulePageConfig(view)

  return (
    <header className="tm-chat-header">
      <div className="tm-chat-breadcrumb">
        <span className="tm-model-pill tm-module-pill">{config.title}</span>
        {config.headerSegments.map((segment) => (
          <span key={segment} className="tm-module-breadcrumb-group">
            <span className="tm-chat-breadcrumb-sep">/</span>
            <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">
              {segment}
            </span>
          </span>
        ))}
      </div>

      <div className="tm-chat-header-end">
        <button
          type="button"
          className="tm-chat-header-settings-btn"
          title={`${config.title}设置`}
          disabled
        >
          <IconSliders size={16} />
        </button>
      </div>
    </header>
  )
}
