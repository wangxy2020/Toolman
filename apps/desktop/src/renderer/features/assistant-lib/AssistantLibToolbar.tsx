import { BookOpen } from 'lucide-react'
import { IconActivity, IconGroup, IconNotes, IconSliders } from '../../components/icons'
import { HeaderIconButton } from '../../components/layout/HeaderIconButton'
import { useI18n } from '../../i18n/useI18n'
import {
  setAssistantLibPanelView,
  type AssistantLibPanelView,
} from './assistant-lib-panel-view'
import { openAssistantLibSettings } from './assistant-lib-ui'

type Props = {
  activeView: AssistantLibPanelView
  onShareNote: () => void
  onShareGroup: () => void
  shareDisabled?: boolean
}

export function AssistantLibToolbar({
  activeView,
  onShareNote,
  onShareGroup,
  shareDisabled = false,
}: Props) {
  const { t } = useI18n()
  return (
    <>
      <HeaderIconButton
        label={t('assistantLibPage.toolbarChat')}
        active={activeView === 'agent'}
        aria-pressed={activeView === 'agent'}
        onClick={() => setAssistantLibPanelView('agent')}
      >
        <BookOpen size={16} />
      </HeaderIconButton>
      <HeaderIconButton
        label={t('assistantLibPage.classroomNotes')}
        disabled={shareDisabled}
        onClick={onShareNote}
      >
        <IconNotes size={16} />
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
