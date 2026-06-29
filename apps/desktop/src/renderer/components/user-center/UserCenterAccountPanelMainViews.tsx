import { GROUP_MAX_MEMBERS_PRO } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { UserCenterMembershipPanel } from './UserCenterMembershipPanel'
import {
  AccountActionBox,
  DeleteIcon,
  LockIcon,
  LogoutIcon,
  PhoneIcon,
  StarIcon,
  WechatIcon,
  type AccountActionItem,
} from './user-center-account-panel-components'
import {
  AccountDeleteDialogs,
  type AccountPanelState,
  type AccountPanelViewProps,
} from './user-center-account-panel-view-shared'
export function UserCenterAccountMainView({
  state,
  onSubViewChange,
}: {
  state: AccountPanelState
  onSubViewChange: AccountPanelViewProps['onSubViewChange']
}) {
  const {
    t,
    account,
    hasPhoneBinding,
    hasWechatBinding,
    canChangePassword,
    setShowDeleteConfirm,
  } = state

  const securityItems: AccountActionItem[] = []

  if (!hasPhoneBinding) {
    securityItems.push({
      key: 'phone',
      icon: <PhoneIcon />,
      label: t('user.account.bindPhoneSection'),
      secondary: t('user.account.bindPhoneHint'),
      onClick: () => onSubViewChange('bind_phone'),
    })
  }
  if (!hasWechatBinding) {
    securityItems.push({
      key: 'wechat',
      icon: <WechatIcon />,
      label: t('user.account.bindWechat'),
      disabled: true,
      onClick: () => onSubViewChange('bind_wechat'),
    })
  }
  if (canChangePassword) {
    securityItems.push({
      key: 'password',
      icon: <LockIcon />,
      label: t('user.account.changePassword'),
      onClick: () => onSubViewChange('change_password'),
    })
  }

  const accountActionItems: AccountActionItem[] = [
    {
      key: 'logout',
      icon: <LogoutIcon />,
      label: t('user.account.logout'),
      onClick: () => void account.logoutAccount().catch(() => undefined),
    },
    {
      key: 'delete',
      icon: <DeleteIcon />,
      label: t('user.account.deleteAccount'),
      danger: true,
      onClick: () => setShowDeleteConfirm(true),
    },
  ]

  return (
    <>
      <div className="tm-user-center-account-panel tm-user-center-account-panel--centered">
        <div className="tm-user-center-account-section">
          <span className="tm-user-center-account-section-label">{t('user.account.membershipSection')}</span>
          <div className="tm-user-center-account-stack">
            <AccountActionBox
              icon={<StarIcon />}
              label={t('user.account.currentPlan', { count: GROUP_MAX_MEMBERS_PRO })}
              highlight
              onClick={() => onSubViewChange('upgrade_membership')}
            />
          </div>
        </div>

        {hasPhoneBinding && hasWechatBinding ? (
          <div className="tm-user-center-account-alert tm-user-center-account-alert--success">
            {t('user.account.securityComplete')}
          </div>
        ) : null}

        {securityItems.length > 0 ? (
          <div className="tm-user-center-account-section">
            <span className="tm-user-center-account-section-label">{t('user.account.securitySection')}</span>
            <div className="tm-user-center-account-stack">
              {securityItems.map((item) => (
                <AccountActionBox
                  key={item.key}
                  icon={item.icon}
                  label={item.label}
                  secondary={item.secondary}
                  danger={item.danger}
                  disabled={account.saving || item.disabled}
                  onClick={item.onClick}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="tm-user-center-account-empty">{t('user.account.securityAllDone')}</p>
        )}

        <div className="tm-user-center-account-section">
          <span className="tm-user-center-account-section-label">{t('user.account.actionsSection')}</span>
          <div className="tm-user-center-account-stack">
            {accountActionItems.map((item) => (
              <AccountActionBox
                key={item.key}
                icon={item.icon}
                label={item.label}
                secondary={item.secondary}
                danger={item.danger}
                disabled={account.saving || item.disabled}
                onClick={item.onClick}
              />
            ))}
          </div>
        </div>
      </div>
      <AccountDeleteDialogs state={state} />
    </>
  )
}

export function UserCenterAccountMembershipView({
  state,
  onSubViewChange,
}: {
  state: AccountPanelState
  onSubViewChange: AccountPanelViewProps['onSubViewChange']
}) {
  return (
    <>
      <UserCenterMembershipPanel active onBack={() => onSubViewChange('main')} />
      <AccountDeleteDialogs state={state} />
    </>
  )
}

export function UserCenterAccountGuestView() {
  const { t } = useI18n()
  return <div className="tm-user-center-account-alert">{t('user.account.registerHint')}</div>
}

export function UserCenterAccountReloginView({
  account,
  onSwitchToLogin,
}: {
  account: AccountPanelState['account']
  onSwitchToLogin: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="tm-user-center-account-panel">
      <div className="tm-user-center-alert tm-user-center-alert--warning">
        {t('user.account.reloginRequired')}
      </div>
      <button
        type="button"
        className="tm-auth-entry-submit-btn"
        disabled={account.saving}
        onClick={onSwitchToLogin}
      >
        {t('user.account.goLogin')}
      </button>
    </div>
  )
}
