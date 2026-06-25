import { useCallback, useEffect, useState } from 'react'

import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'

import type { useUserAccount } from '../../features/user/useUserAccount'
import {
  UserCenterAccountPanel,
  accountPanelSubtitle,
  accountPanelTitle,
} from './UserCenterAccountPanel'
import { UserCenterAuthViews } from './UserCenterAuthViews'
import { UserCenterLocalPanel } from './UserCenterLocalPanel'
import type { ProfileSubView, UserCenterSuccessBehavior, ViewMode } from './types'
import { useUserCenterAuth, viewSubtitle, viewTitle } from './useUserCenterAuth'
import { isRegisteredUser } from '../../features/user/user-account-utils'
import { useI18n } from '../../i18n/useI18n'

export interface UserCenterModalProps {
  open: boolean
  initialView?: ViewMode
  initialProfileSubView?: ProfileSubView
  onClose: () => void
  onSuccess?: () => void
  successBehavior?: UserCenterSuccessBehavior
  account: ReturnType<typeof useUserAccount>
}

function authPanelTitle(view: ViewMode, t: ReturnType<typeof useI18n>['t']): string {
  return viewTitle(view, t)
}

function authPanelSubtitle(
  view: ViewMode,
  t: ReturnType<typeof useI18n>['t'],
  region?: Parameters<typeof viewSubtitle>[2],
): string {
  return viewSubtitle(view, t, region)
}

export function UserCenterModal({
  open,
  initialView = 'login',
  initialProfileSubView = 'main',
  onClose,
  onSuccess,
  successBehavior = 'close',
  account,
}: UserCenterModalProps) {
  const { t } = useI18n()
  const [view, setView] = useState<ViewMode>(initialView)
  const [profileSubView, setProfileSubView] = useState<ProfileSubView>('main')

  const loggedIn = isRegisteredUser(account.authSession) && account.isLoggedIn
  const showAccountPanel = loggedIn && view === 'profile'

  const handleAuthComplete = useCallback(() => {
    onSuccess?.()
    if (successBehavior === 'profile') {
      setView('profile')
      setProfileSubView('main')
      void account.load().catch(() => undefined)
      return
    }
    onClose()
  }, [account, onClose, onSuccess, successBehavior])

  const auth = useUserCenterAuth({
    open,
    view,
    onAuthComplete: handleAuthComplete,
  })

  useEffect(() => {
    if (!open) return
    setView(initialView)
    setProfileSubView(initialProfileSubView)
  }, [open, initialView, initialProfileSubView])

  useEffect(() => {
    if (!loggedIn && view === 'profile') {
      setView('login')
      setProfileSubView('main')
    }
  }, [loggedIn, view])

  const rightTitle = showAccountPanel
    ? accountPanelTitle(profileSubView, t)
    : authPanelTitle(view, t)
  const rightSubtitle = showAccountPanel
    ? accountPanelSubtitle(profileSubView, t)
    : authPanelSubtitle(view, t, auth.region)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth={false}
      maxWidth={false}
      scroll="body"
      className="tm-user-center-dialog-root"
      slotProps={{
        backdrop: { className: 'tm-user-center-dialog-backdrop' },
        paper: { className: 'tm-user-center-dialog-paper' },
      }}
    >
      <IconButton
        className="tm-user-center-close"
        aria-label={t('common.close')}
        size="small"
        onClick={onClose}
      >
        <CloseRoundedIcon fontSize="small" />
      </IconButton>

      <DialogContent className="tm-user-center-dialog-content">
        <aside className="tm-user-center-local">
          <UserCenterLocalPanel account={account} />
        </aside>

        <section className="tm-user-center-auth-panel" aria-labelledby="user-center-title">
          <header className="tm-user-center-header tm-user-center-header--auth">
            <h2 className="tm-user-center-title" id="user-center-title">
              {rightTitle}
            </h2>
            <p className="tm-user-center-subtitle">{rightSubtitle}</p>
          </header>

          <div className="tm-user-center-auth-stack">
            {!showAccountPanel && auth.error ? (
              <div className="tm-auth-entry-error" role="alert">
                {auth.error}
              </div>
            ) : null}
            {!showAccountPanel && auth.devHint ? (
              <div className="tm-auth-entry-dev-hint">{auth.devHint}</div>
            ) : null}

            {showAccountPanel ? (
              <UserCenterAccountPanel
                account={account}
                subView={profileSubView}
                onSubViewChange={setProfileSubView}
                onSwitchToLogin={() => setView('login')}
              />
            ) : (
              <UserCenterAuthViews view={view} auth={auth} onSwitchView={setView} />
            )}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
