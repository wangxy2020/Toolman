import {
  AccountField,
  AccountPasswordInput,
} from './user-center-account-panel-components'
import { AccountDeleteDialogs, type AccountPanelViewProps } from './user-center-account-panel-view-shared'

export function UserCenterAccountBindPhoneView({
  state,
  onSubViewChange,
}: AccountPanelViewProps) {
  const { t, bindError, bindPhone, setBindPhone, bindCode, setBindCode, bindBusy, bindCooldown, sendBindCode, submitBindPhone } = state

  return (
    <>
      <div className="tm-user-center-account-panel">
        {bindError ? (
          <div className="tm-user-center-alert tm-user-center-alert--error" role="alert">
            {bindError}
          </div>
        ) : null}
        <div className="tm-user-center-account-form">
          <AccountField
            label={t('user.account.phone')}
            type="tel"
            inputMode="tel"
            value={bindPhone}
            disabled={bindBusy}
            onChange={setBindPhone}
          />
          <div className="tm-auth-entry-code-row">
            <div className="tm-auth-entry-input-shell tm-auth-entry-input-shell--grow">
              <input
                className="tm-auth-entry-input tm-auth-entry-input--plain"
                type="text"
                inputMode="numeric"
                placeholder={t('user.account.verificationCode')}
                value={bindCode}
                disabled={bindBusy}
                onChange={(e) => setBindCode(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="tm-auth-entry-sms-btn"
              disabled={bindBusy || !bindPhone.trim() || bindCooldown > 0}
              onClick={() => void sendBindCode()}
            >
              {bindCooldown > 0 ? `${bindCooldown}s` : t('user.auth.getCode')}
            </button>
          </div>
          <button
            type="button"
            className="tm-auth-entry-submit-btn"
            disabled={bindBusy || !bindPhone.trim() || !bindCode.trim()}
            onClick={() => void submitBindPhone()}
          >
            {t('user.account.confirmBind')}
          </button>
          <button
            type="button"
            className="tm-user-center-text-link"
            disabled={bindBusy}
            onClick={() => onSubViewChange('main')}
          >
            {t('user.account.back')}
          </button>
        </div>
      </div>
      <AccountDeleteDialogs state={state} />
    </>
  )
}

export function UserCenterAccountBindWechatView({
  state,
  onSubViewChange,
}: AccountPanelViewProps) {
  const { t, bindError, bindBusy, submitBindWechat } = state

  return (
    <>
      <div className="tm-user-center-account-panel tm-user-center-account-panel--centered">
        {bindError ? (
          <div className="tm-user-center-account-alert tm-user-center-account-alert--error" role="alert">
            {bindError}
          </div>
        ) : null}
        <div className="tm-user-center-account-form tm-user-center-account-form--auth">
          <p className="tm-user-center-account-form-desc">{t('user.account.wechatBindHint')}</p>
          <button
            type="button"
            className="tm-auth-entry-submit-btn"
            disabled={bindBusy}
            onClick={() => void submitBindWechat()}
          >
            {t('user.account.openWechatAuth')}
          </button>
          <button
            type="button"
            className="tm-user-center-text-link"
            disabled={bindBusy}
            onClick={() => onSubViewChange('main')}
          >
            {t('user.account.back')}
          </button>
        </div>
      </div>
      <AccountDeleteDialogs state={state} />
    </>
  )
}

export function UserCenterAccountChangePasswordView({
  state,
  onSubViewChange,
}: AccountPanelViewProps) {
  const {
    t,
    passwordError,
    passwordSuccess,
    oldPassword,
    setOldPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    passwordBusy,
    submitChangePassword,
  } = state

  return (
    <>
      <div className="tm-user-center-account-panel tm-user-center-account-panel--centered">
        {passwordError ? (
          <div className="tm-user-center-account-alert tm-user-center-account-alert--error" role="alert">
            {passwordError}
          </div>
        ) : null}
        {passwordSuccess ? (
          <div className="tm-user-center-account-alert tm-user-center-account-alert--success">
            {t('user.account.passwordUpdated')}
          </div>
        ) : null}
        <div className="tm-user-center-account-form tm-user-center-account-form--auth">
          <AccountPasswordInput
            autoComplete="current-password"
            placeholder={t('user.account.placeholderOldPassword')}
            value={oldPassword}
            disabled={passwordBusy || passwordSuccess}
            onChange={setOldPassword}
          />
          <AccountPasswordInput
            autoComplete="new-password"
            placeholder={t('user.account.placeholderNewPassword')}
            value={newPassword}
            disabled={passwordBusy || passwordSuccess}
            onChange={setNewPassword}
          />
          <AccountPasswordInput
            autoComplete="new-password"
            placeholder={t('user.account.placeholderConfirmNewPassword')}
            value={confirmPassword}
            disabled={passwordBusy || passwordSuccess}
            onChange={setConfirmPassword}
          />
          <button
            type="button"
            className="tm-auth-entry-submit-btn"
            disabled={
              passwordBusy ||
              passwordSuccess ||
              !oldPassword.trim() ||
              !newPassword.trim() ||
              !confirmPassword.trim()
            }
            onClick={() => void submitChangePassword()}
          >
            {t('user.account.changePasswordConfirm')}
          </button>
          <button
            type="button"
            className="tm-user-center-text-link"
            disabled={passwordBusy}
            onClick={() => onSubViewChange('main')}
          >
            {t('user.account.back')}
          </button>
        </div>
      </div>
      <AccountDeleteDialogs state={state} />
    </>
  )
}
