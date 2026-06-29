import {
  IconActivity,
  IconAgent,
  IconKnowledge,
  IconMessageBoard,
  IconNotes,
  IconUsers,
  IconWorkflow,
} from '../../components/icons'
import type { GroupPageHeaderAction } from './group-page-component-types'

export function buildGroupPageHeaderActions(
  t: (key: string) => string,
): GroupPageHeaderAction[] {
  return [
    { key: 'members', icon: <IconUsers size={16} />, title: t('groupPage.header.members') },
    { key: 'messages', icon: <IconMessageBoard size={16} />, title: t('groupPage.header.messages') },
    { key: 'agents', icon: <IconAgent size={16} />, title: t('groupPage.header.agents') },
    { key: 'knowledge', icon: <IconKnowledge size={16} />, title: t('groupPage.header.knowledge') },
    { key: 'notes', icon: <IconNotes size={16} />, title: t('groupPage.header.notes') },
    { key: 'workflow', icon: <IconWorkflow size={16} />, title: t('groupPage.header.workflow') },
    { key: 'activity', icon: <IconActivity size={16} />, title: t('groupPage.header.activity') },
  ]
}
