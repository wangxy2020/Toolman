import type { Workspace } from '@toolman/shared'
import { IconChevronDown } from '../../components/icons'
import { useSystemPaths } from './useSystemPaths'
import {
  getEffectiveWorkingDirectory,
  getFolderDisplayName,
} from './workspace-utils'

interface Props {
  workspace: Workspace | null
  workingDirectory?: string
  onSelectFolder: () => void
  readOnly?: boolean
}

export function WorkspaceFolderSelector({
  workspace,
  workingDirectory,
  onSelectFolder,
  readOnly = false,
}: Props) {
  const systemPaths = useSystemPaths()
  const folderPath = getEffectiveWorkingDirectory(workingDirectory, workspace, systemPaths)
  const label = folderPath
    ? getFolderDisplayName(folderPath, systemPaths)
    : workspace
      ? workspace.name
      : '未选择工作区'
  const displayTitle = folderPath ? getFolderDisplayName(folderPath, systemPaths) : '点击选择工作区文件夹'

  if (readOnly) {
    return (
      <span className="tm-model-pill tm-workspace-pill tm-model-pill--static" title={folderPath ?? displayTitle}>
        <span className="tm-workspace-pill-label">{label}</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      className="tm-model-pill tm-workspace-pill"
      onClick={onSelectFolder}
      title={folderPath ?? displayTitle}
    >
      <span className="tm-workspace-pill-label">{label}</span>
      <IconChevronDown />
    </button>
  )
}
