import { IconSliders } from '../../components/icons'
import { translateGroupName } from '../../i18n/system-labels'
import type { UseGroupPageResult } from './useGroupPage'

type GroupPageHeaderProps = Pick<
  UseGroupPageResult,
  | 't'
  | 'workspace'
  | 'displayWorkspace'
  | 'effectiveAction'
  | 'membersMenuOpen'
  | 'membersButtonRef'
  | 'headerActions'
  | 'handleHeaderActionClick'
  | 'handleOpenSettings'
>

export function GroupPageHeader({
  t,
  workspace,
  displayWorkspace,
  effectiveAction,
  membersMenuOpen,
  membersButtonRef,
  headerActions,
  handleHeaderActionClick,
  handleOpenSettings,
}: GroupPageHeaderProps) {
  return (
    <header className="tm-chat-header">
      <div className="tm-chat-breadcrumb">
        <span className="tm-model-pill tm-module-pill">{t('groupPage.title')}</span>
        <span className="tm-module-breadcrumb-group">
          <span className="tm-chat-breadcrumb-sep">/</span>
          <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">
            {translateGroupName(displayWorkspace?.name ?? t('groupPage.selectGroup'), t)}
          </span>
        </span>
      </div>

      <div className="tm-chat-header-end">
        {headerActions.map((action) => {
          const isMembersMenu = action.key === 'members'
          const isActive = isMembersMenu ? membersMenuOpen : effectiveAction === action.key

          return (
            <button
              key={action.key}
              ref={isMembersMenu ? membersButtonRef : undefined}
              type="button"
              className={[
                'tm-chat-header-settings-btn',
                isActive ? 'tm-chat-header-settings-btn--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={action.title}
              aria-label={action.title}
              aria-pressed={isActive}
              aria-expanded={isMembersMenu ? membersMenuOpen : undefined}
              onClick={() => handleHeaderActionClick(action.key)}
            >
              {action.icon}
            </button>
          )
        })}

        <button
          type="button"
          className="tm-chat-header-settings-btn"
          title={t('groupPage.settingsTitle')}
          aria-label={t('groupPage.settingsTitle')}
          disabled={!workspace}
          onClick={handleOpenSettings}
        >
          <IconSliders size={16} />
        </button>
      </div>
    </header>
  )
}
