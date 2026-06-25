import type { CommunityUserRole } from '@toolman/shared'

import type { TranslateFn } from './I18nProvider'

const BUILTIN_LOCAL_DISPLAY_NAMES = new Set(['本地用户', 'P2P 用户 B'])

export function getCommunityUserRoleLabel(role: CommunityUserRole, t: TranslateFn): string {
  return t(`communityPage.userRoles.${role}`)
}

export function translateCommunityDisplayName(name: string, t: TranslateFn): string {
  if (BUILTIN_LOCAL_DISPLAY_NAMES.has(name)) {
    return t('user.profile.localUser')
  }
  return name
}

export function getModerationLogActionLabel(action: string, t: TranslateFn): string {
  const key = `communityPage.admin.logActions.${action}` as const
  const translated = t(key)
  return translated === key ? action : translated
}

export function getModerationLogTargetTypeLabel(targetType: string, t: TranslateFn): string {
  const key = `communityPage.admin.logTargetTypes.${targetType}` as const
  const translated = t(key)
  return translated === key ? targetType : translated
}
