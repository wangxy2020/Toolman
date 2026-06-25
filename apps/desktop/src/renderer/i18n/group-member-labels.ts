import type { P2pMemberRole } from '@toolman/shared'

import type { TranslateFn } from './I18nProvider'

export function getGroupMemberRoleLabel(role: P2pMemberRole, t: TranslateFn): string {
  return t(`groupPage.members.roles.${role}`)
}

export function getGroupConnectionModeLabel(
  mode: 'lan' | 'wan',
  t: TranslateFn,
): string {
  return t(`groupPage.members.connectionModes.${mode}`)
}
