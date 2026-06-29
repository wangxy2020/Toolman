import type { useI18n } from '../../i18n/useI18n'
import type { ProfileSubView } from './types'

export function accountPanelTitle(
  subView: ProfileSubView,
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (subView) {
    case 'bind_phone':
      return t('user.account.titles.bindPhone')
    case 'bind_wechat':
      return t('user.account.titles.bindWechat')
    case 'change_password':
      return t('user.account.titles.changePassword')
    case 'upgrade_membership':
      return t('user.account.titles.upgradeMembership')
    default:
      return t('user.account.titles.accountSecurity')
  }
}

export function accountPanelSubtitle(
  subView: ProfileSubView,
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (subView) {
    case 'bind_phone':
    case 'bind_wechat':
    case 'change_password':
    case 'upgrade_membership':
      return t('user.account.subtitles.afterAction')
    default:
      return t('user.account.subtitles.manage')
  }
}
