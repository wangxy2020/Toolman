import { requiresDeleteReauth } from '@toolman/shared'

import { ConfirmDialog } from '../ConfirmDialog'
import { DeleteAccountReauthModal } from '../../features/user/DeleteAccountReauthModal'
import { useI18n } from '../../i18n/useI18n'
import type { useUserAccount } from '../../features/user/useUserAccount'

export function UserCenterAccountDeleteDialogs({
  account,
  authSession,
  showDeleteConfirm,
  showDeleteReauth,
  onCloseConfirm,
  onShowReauth,
  onCloseReauth,
}: {
  account: ReturnType<typeof useUserAccount>
  authSession: ReturnType<typeof useUserAccount>['authSession']
  showDeleteConfirm: boolean
  showDeleteReauth: boolean
  onCloseConfirm: () => void
  onShowReauth: () => void
  onCloseReauth: () => void
}) {
  const { t } = useI18n()

  return (
    <>
      {showDeleteConfirm ? (
        <ConfirmDialog
          title={t('user.account.deleteAccount')}
          message={t('user.account.deleteConfirmMessage')}
          confirmLabel={t('user.account.confirmDelete')}
          danger
          onCancel={onCloseConfirm}
          onConfirm={() => {
            onCloseConfirm()
            if (
              authSession &&
              requiresDeleteReauth(authSession.lastLoginAt ?? null, authSession.bindings)
            ) {
              onShowReauth()
              return
            }
            void account.deleteAccount().catch(() => undefined)
          }}
        />
      ) : null}
      {showDeleteReauth && authSession ? (
        <DeleteAccountReauthModal
          open
          session={authSession}
          onClose={onCloseReauth}
          onDelete={async (reauthToken) => {
            await account.deleteAccount({ reauthToken })
          }}
        />
      ) : null}
    </>
  )
}
