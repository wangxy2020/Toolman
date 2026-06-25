import { useState } from 'react'
import { GroupPanelHeader } from './GroupPanelHeader'
import { GroupPanelRefreshButton } from './GroupPanelRefreshButton'
import { GroupResourcePickerModal } from './GroupResourcePickerModal'
import { useRegisterGroupPanelError } from './group-page-status'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  workspaceName: string
}

export function GroupWorkflowPanel({ workspaceName }: Props) {
  const { t } = useI18n()
  const [showPicker, setShowPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sharedCount = 0

  useRegisterGroupPanelError('workflow', error, () => setError(null))

  return (
    <div className="tm-group-member-panel tm-group-resource-panel">
      <GroupPanelHeader
        title={t('groupPage.header.workflow')}
        subtitle={`${workspaceName} · ${t('groupPage.panels.count', {
          count: sharedCount,
          type: t('groupPage.panels.types.workflows'),
        })}`}
        actions={<GroupPanelRefreshButton onRefresh={() => {}} />}
      />

      <div className="tm-kb-file-panel">
        <button
          type="button"
          className="tm-kb-file-dropzone"
          onClick={() => setShowPicker(true)}
        >
          <span className="tm-kb-file-dropzone-title">
            {t('groupPage.panels.clickAdd', { type: t('groupPage.panels.types.workflows') })}
          </span>
          <span className="tm-kb-file-dropzone-hint">
            {t('groupPage.panels.pickHint', { type: t('groupPage.panels.types.workflows') })}
          </span>
        </button>

        <div className="tm-kb-file-panel-empty">
          <p>{t('groupPage.panels.empty', { type: t('groupPage.panels.types.workflows') })}</p>
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
