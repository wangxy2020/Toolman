import { ModulePage } from '../modules/ModulePage'
import type { ModuleView } from '../../types/app-view'

type ChatPageModuleViewProps = {
  activeView: ModuleView
}

export function ChatPageModuleView({ activeView }: ChatPageModuleViewProps) {
  return <ModulePage view={activeView} />
}
