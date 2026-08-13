import { BookOpen, GraduationCap } from 'lucide-react'
import { IconActivity, IconGroup, IconSliders } from '../../components/icons'
import { HeaderIconButton } from '../../components/layout/HeaderIconButton'
import { useI18n } from '../../i18n/useI18n'
import {
  setAssistantLibPanelView,
  type AssistantLibPanelView,
} from './assistant-lib-panel-view'
import { openAssistantLibSettings } from './assistant-lib-ui'

type Props = {
  activeView: AssistantLibPanelView
  onShareGroup: () => void
  shareDisabled?: boolean
  classLive?: boolean
  onToggleClass?: () => void
  classToggleDisabled?: boolean
}

export function AssistantLibToolbar({
  activeView,
  onShareGroup,
  shareDisabled = false,
  classLive = false,
  onToggleClass,
  classToggleDisabled = false,
}: Props) {
  const { t } = useI18n()
  return (
    <>
      <HeaderIconButton
        label={classLive ? t('assistantLibPage.stopClass') : t('assistantLibPage.startClass')}
        disabled={classToggleDisabled || !onToggleClass}
        active={classLive}
        aria-pressed={classLive}
        onClick={() => onToggleClass?.()}
      >
        <GraduationCap size={16} />
      </HeaderIconButton>
      <HeaderIconButton
        label={t('assistantLibPage.toolbarChat')}
        active={activeView === 'agent'}
        aria-pressed={activeView === 'agent'}
        onClick={() => setAssistantLibPanelView('agent')}
      >
        <BookOpen size={16} />
      </HeaderIconButton>
      <HeaderIconButton
        label={t('assistantLibPage.records.title')}
        active={activeView === 'records'}
        aria-pressed={activeView === 'records'}
        onClick={() => setAssistantLibPanelView('records')}
      >
        <IconActivity size={16} />
      </HeaderIconButton>
      <HeaderIconButton
        label={t('assistantLibPage.shareGroup')}
        disabled={shareDisabled}
        onClick={onShareGroup}
      >
        <IconGroup size={16} />
      </HeaderIconButton>
      <HeaderIconButton
        label={t('assistantLibPage.settingsTitle')}
        onClick={() => openAssistantLibSettings()}
      >
        <IconSliders size={16} />
      </HeaderIconButton>
    </>
  )
}
