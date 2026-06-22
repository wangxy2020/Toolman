import { useState } from 'react'
import { GroupPanelHeader } from './GroupPanelHeader'
import { GroupPanelRefreshButton } from './GroupPanelRefreshButton'
import { GroupResourcePickerModal } from './GroupResourcePickerModal'
import { useRegisterGroupPanelError } from './group-page-status'

interface Props {
  workspaceName: string
}

export function GroupWorkflowPanel({ workspaceName }: Props) {
  const [showPicker, setShowPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sharedCount = 0

  useRegisterGroupPanelError('workflow', error, () => setError(null))

  return (
    <div className="tm-group-member-panel tm-group-resource-panel">
      <GroupPanelHeader
        title="群组工作流"
        subtitle={`${workspaceName} · ${sharedCount} 个工作流`}
        actions={<GroupPanelRefreshButton onRefresh={() => {}} />}
      />

      <div className="tm-kb-file-panel">
        <button
          type="button"
          className="tm-kb-file-dropzone"
          onClick={() => setShowPicker(true)}
        >
          <span className="tm-kb-file-dropzone-title">点击添加工作流到群组</span>
          <span className="tm-kb-file-dropzone-hint">从已有工作流中选择，共享给群组成员</span>
        </button>

        <div className="tm-kb-file-panel-empty">
          <p>暂无群组工作流，点击上方区域添加</p>
        </div>
      </div>

      {showPicker ? (
        <GroupResourcePickerModal
          title="选择工作流"
          hint="展开工作流可查看节点，勾选工作流将全选其中内容。"
          confirmLabel="添加"
          groups={[]}
          onClose={() => setShowPicker(false)}
          onConfirm={async () => {
            setError('群组工作流共享功能正在开发中，请稍后再试。')
            throw new Error('群组工作流共享功能正在开发中，请稍后再试。')
          }}
        />
      ) : null}
    </div>
  )
}
