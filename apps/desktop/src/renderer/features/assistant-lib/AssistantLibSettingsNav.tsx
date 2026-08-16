import type { AssistantLibSettingsTab } from './assistant-lib-settings-utils'
import type { useAssistantLibSettingsDialog } from './hooks/useAssistantLibSettingsDialog'

type DialogState = ReturnType<typeof useAssistantLibSettingsDialog>

export function AssistantLibSettingsNav({
  t,
  activeTab,
  selectTab,
}: {
  t: DialogState['t']
  activeTab: AssistantLibSettingsTab
  selectTab: (tab: AssistantLibSettingsTab) => void
}) {
  return (
<nav
                className="tm-kb-settings-modal-nav"
                aria-label={t('assistantLibPage.settingsNavAria')}
              >
                <button
                  type="button"
                  className={[
                    'tm-kb-settings-modal-nav-item',
                    activeTab === 'basic' ? 'tm-kb-settings-modal-nav-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectTab('basic')}
                >
                  <span>{t('assistantLibPage.settingsBasicTab')}</span>
                </button>
                <button
                  type="button"
                  className={[
                    'tm-kb-settings-modal-nav-item',
                    activeTab === 'teaching' ? 'tm-kb-settings-modal-nav-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectTab('teaching')}
                >
                  <span>{t('assistantLibPage.settingsTeachingTab')}</span>
                </button>
                <button
                  type="button"
                  className={[
                    'tm-kb-settings-modal-nav-item',
                    activeTab === 'lesson' ? 'tm-kb-settings-modal-nav-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectTab('lesson')}
                >
                  <span>{t('assistantLibPage.settingsLessonTab')}</span>
                </button>
                <button
                  type="button"
                  className={[
                    'tm-kb-settings-modal-nav-item',
                    activeTab === 'sync' ? 'tm-kb-settings-modal-nav-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectTab('sync')}
                >
                  <span>{t('assistantLibPage.settingsSyncTab')}</span>
                </button>
                <button
                  type="button"
                  className={[
                    'tm-kb-settings-modal-nav-item',
                    activeTab === 'danger' ? 'tm-kb-settings-modal-nav-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectTab('danger')}
                >
                  <span>{t('assistantLibPage.settingsDangerTab')}</span>
                </button>
              </nav>
  )
}
