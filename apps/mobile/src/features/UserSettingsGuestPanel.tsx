import { Pressable, Text, View } from 'react-native'
import type { MobileAuthSession } from '../auth/types'
import {
  SettingsScroll,
  settingsUiStyles as styles,
} from './settingsUi'
import { SOCIAL_ITEMS } from './userSettingsUtils'
import { useGuestAuth } from './useUserSettingsPanel'

import { AuthTextField, SocialProviderIcon } from './UserSettingsShared'

export function GuestAuthPanel({ onSession }: { onSession: (s: MobileAuthSession) => void }) {
  const {
    view,
    account,
    smsCode,
    setSmsCode,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    message,
    busy,
    sendingCode,
    smsCooldown,
    otpHint,
    firebaseReady,
    showOtpRow,
    showConfirmPassword,
    formReady,
    title,
    subtitle,
    primaryLabel,
    messageIsOk,
    sendCode,
    goToView,
    onAccountChange,
    submitForm,
    loginWithSocial,
  } = useGuestAuth(onSession)

  return (
    <SettingsScroll>
      <View style={styles.authCard}>
        <Text style={styles.authTitle}>{title}</Text>
        <Text style={styles.authSubtitle}>{subtitle}</Text>

        <View style={styles.authForm}>
          <AuthTextField
            value={account}
            onChangeText={onAccountChange}
            placeholder={view === 'forgot' ? '请输入注册手机或邮箱' : '请输入手机或邮箱'}
          />

          {showOtpRow ? (
            <>
              {otpHint ? <Text style={styles.authInlineHint}>{otpHint}</Text> : null}
              <View style={styles.otpRow}>
                <View style={styles.otpInputGrow}>
                  <AuthTextField
                    value={smsCode}
                    onChangeText={setSmsCode}
                    placeholder="请输入验证码"
                  />
                </View>
                <Pressable
                  style={[
                    styles.otpSendBtn,
                    busy || sendingCode || !account.trim() || smsCooldown > 0
                      ? styles.otpSendBtnDisabled
                      : null,
                  ]}
                  disabled={busy || sendingCode || !account.trim() || smsCooldown > 0}
                  onPress={() => void sendCode()}
                >
                  <Text style={styles.otpSendBtnText}>
                    {sendingCode ? '发送中…' : smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}

          <AuthTextField
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={view === 'forgot' ? '请输入新密码' : '请输入密码'}
          />

          {showConfirmPassword ? (
            <AuthTextField
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="请再次输入密码"
            />
          ) : null}

          <Pressable
            style={[styles.authSubmit, busy || !formReady ? styles.btnDisabled : null]}
            disabled={busy || !formReady}
            onPress={submitForm}
          >
            <Text style={styles.authSubmitText}>{primaryLabel}</Text>
          </Pressable>
        </View>

        {view !== 'forgot' ? (
          <View style={styles.socialBlock}>
            <View style={styles.socialDivider}>
              <View style={styles.socialDividerLine} />
              <Text style={styles.socialDividerText}>或使用第三方登录</Text>
              <View style={styles.socialDividerLine} />
            </View>
            <View style={styles.socialGrid}>
              {SOCIAL_ITEMS.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  disabled={busy || !item.enabled || (item.enabled && !firebaseReady)}
                  style={[
                    styles.socialBtn,
                    item.enabled && firebaseReady ? null : styles.socialBtnDisabled,
                  ]}
                  onPress={() => {
                    if (!item.enabled) return
                    loginWithSocial(item.id)
                  }}
                >
                  <SocialProviderIcon id={item.id} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.authFooterRow}>
          {view === 'login' ? (
            <>
              <Text style={styles.authFooterMuted}>
                没有账号？
                <Text style={styles.authFooterLink} onPress={() => goToView('register')}>
                  立即注册
                </Text>
              </Text>
              <Text style={styles.authFooterLink} onPress={() => goToView('forgot')}>
                忘记密码？
              </Text>
            </>
          ) : view === 'register' ? (
            <Text style={styles.authFooterMuted}>
              已有账号？
              <Text style={styles.authFooterLink} onPress={() => goToView('login')}>
                立即登录
              </Text>
            </Text>
          ) : (
            <Text style={styles.authFooterLink} onPress={() => goToView('login')}>
              返回登录
            </Text>
          )}
        </View>

        {message ? (
          <Text style={[styles.hint, messageIsOk ? styles.hintOk : styles.hintError]}>{message}</Text>
        ) : null}
      </View>
    </SettingsScroll>
  )
}
