import type { ReactNode } from 'react'

import type { ViewMode } from './types'
import type { useUserCenterAuth } from './useUserCenterAuth'
import { useI18n } from '../../i18n/useI18n'
import {
  UserCenterAuthCnBody,
  UserCenterAuthCnConfigHint,
  UserCenterAuthCnMergeBody,
} from './UserCenterAuthCnBody'
import { UserCenterAuthFooter } from './UserCenterAuthFooter'
import { UserCenterAuthIntlBody, UserCenterAuthIntlConfigHint } from './UserCenterAuthIntlBody'

interface UserCenterAuthViewsProps {
  view: ViewMode
  auth: ReturnType<typeof useUserCenterAuth>
  onSwitchView: (view: ViewMode) => void
}

export function UserCenterAuthViews({ view, auth, onSwitchView }: UserCenterAuthViewsProps) {
  const { t } = useI18n()
  const { profileLoading, providerConfigLoading, showIntlAuth, showCnAuth, mergeState } = auth

  if (profileLoading || providerConfigLoading) {
    return <p className="tm-user-center-loading">{t('user.auth.loadingConfig')}</p>
  }

  let configHint: ReactNode = null
  let body: ReactNode = null

  if (showIntlAuth) {
    configHint = <UserCenterAuthIntlConfigHint auth={auth} />
    body = <UserCenterAuthIntlBody view={view} auth={auth} />
  } else if (showCnAuth && mergeState) {
    body = <UserCenterAuthCnMergeBody auth={auth} />
  } else if (showCnAuth) {
    configHint = <UserCenterAuthCnConfigHint auth={auth} />
    body = <UserCenterAuthCnBody view={view} auth={auth} />
  } else {
    body = <p className="tm-auth-entry-section-desc">{t('user.auth.unsupportedRegion')}</p>
  }

  return (
    <div className="tm-user-center-auth-views">
      <div className="tm-user-center-auth-views-main">
        <div className="tm-auth-entry-config-hint-slot">{configHint}</div>
        <div className="tm-user-center-auth-body">{body}</div>
      </div>
      <footer className="tm-user-center-footer">
        <UserCenterAuthFooter view={view} auth={auth} onSwitchView={onSwitchView} />
      </footer>
    </div>
  )
}
