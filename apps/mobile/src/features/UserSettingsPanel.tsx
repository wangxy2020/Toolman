import { Pressable, Text, TextInput, View } from 'react-native'
import type { MobileAuthSession } from '../auth/types'
import {
  IconApple,
  IconDouyin,
  IconGoogle,
  IconWechat,
} from '../icons/auth-social-icons'
import { colors } from '../theme'
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  Section,
  SettingsScroll,
  settingsUiStyles as styles,
} from './settingsUi'
import { SOCIAL_ITEMS, type SocialProvider } from './userSettingsUtils'
import {
  useGuestAuth,
  useLoggedInAccount,
  useUserSettingsPanel,
} from './useUserSettingsPanel'

function SocialProviderIcon({ id }: { id: SocialProvider }) {
  const muted = '#9ca3af'
  switch (id) {
    case 'wechat':
      return <IconWechat size={20} color={muted} />
    case 'douyin':
      return <IconDouyin size={20} color={muted} />
    case 'google':
      return <IconGoogle size={20} />
    case 'apple':
      return <IconApple size={20} color={colors.text} />
  }
}

export function UserSettingsPanel() {
  const { auth, setAuth, syncStatus, onSync } = useUserSettingsPanel()

  if (!auth) {
    return <GuestAuthPanel onSession={setAuth} />
  }

  return (
    <LoggedInAccountPanel
      auth={auth}
      setAuth={setAuth}
      syncStatus={syncStatus}
      onSync={onSync}
    />
  )
}

function AuthTextField(props: {
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  secureTextEntry?: boolean
}) {
  return (
    <TextInput
      style={styles.authInput}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={colors.textSecondary}
      secureTextEntry={props.secureTextEntry}
      autoCapitalize="none"
      autoCorrect={false}
      underlineColorAndroid="transparent"
    />
  )
}

function GuestAuthPanel({ onSession }: { onSession: (s: MobileAuthSession) => void }) {
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

function LoggedInAccountPanel(props: {
  auth: MobileAuthSession
  setAuth: (s: MobileAuthSession | null) => void
  syncStatus: string
  onSync: () => Promise<string>
}) {
  const {
    view,
    setView,
    displayName,
    setDisplayName,
    bindPhone,
    bindCode,
    setBindCode,
    smsCooldown,
    sendingCode,
    otpHint,
    oldPassword,
    setOldPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    deletePassword,
    setDeletePassword,
    deleteConfirm,
    setDeleteConfirm,
    message,
    busy,
    skuLabel,
    accountLabel,
    isVip,
    hasPhoneBinding,
    hasWechatBinding,
    profileRoleLabel,
    syncTitle,
    bindPhoneTitle,
    isPro,
    syncing,
    sendBindPhoneCode,
    submitPasswordChange,
    submitSkuChange,
    submitDeleteAccount,
    submitBindPhone,
    notifyWechatUnavailable,
    saveDisplayName,
    syncNow,
    logout,
    openBindPhone,
    openBindWechat,
    onBindPhoneChange,
  } = useLoggedInAccount(props)

  if (view === 'password') {
    return (
      <SettingsScroll>
        <SecondaryButton label="← 返回" onPress={() => setView('main')} />
        <Section title="修改密码">
          <Field
            value={oldPassword}
            onChangeText={setOldPassword}
            secureTextEntry
            placeholder="请输入原密码"
          />
          <Field
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="请输入新密码"
          />
          <Field
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="请再次输入新密码"
          />
          <PrimaryButton
            label={busy ? '保存中…' : '确认修改'}
            onPress={() => void submitPasswordChange()}
          />
        </Section>
        {message ? <Text style={styles.hint}>{message}</Text> : null}
      </SettingsScroll>
    )
  }

  if (view === 'vip') {
    return (
      <SettingsScroll>
        <SecondaryButton label="← 返回" onPress={() => setView('main')} />
        <Section title="会员">
          <Text style={styles.meta}>当前方案：{skuLabel}</Text>
          {isPro ? (
            <SecondaryButton
              label="恢复社区版"
              onPress={() => void submitSkuChange('community')}
            />
          ) : (
            <PrimaryButton
              label="开通专业版"
              onPress={() => void submitSkuChange('pro')}
            />
          )}
        </Section>
        {message ? <Text style={styles.hint}>{message}</Text> : null}
      </SettingsScroll>
    )
  }

  if (view === 'delete') {
    return (
      <SettingsScroll>
        <SecondaryButton label="← 返回" onPress={() => setView('main')} />
        <Section title="注销账户">
          <Text style={styles.hint}>注销后不可恢复，请输入密码并填写 DELETE 确认。</Text>
          <Field
            label="登录密码"
            value={deletePassword}
            onChangeText={setDeletePassword}
            secureTextEntry
          />
          <Field label="输入 DELETE 确认" value={deleteConfirm} onChangeText={setDeleteConfirm} />
          <Pressable style={styles.dangerBtn} onPress={() => void submitDeleteAccount()}>
            <Text style={styles.dangerBtnText}>确认注销</Text>
          </Pressable>
        </Section>
        {message ? <Text style={[styles.hint, styles.hintError]}>{message}</Text> : null}
      </SettingsScroll>
    )
  }

  if (view === 'bind_phone') {
    return (
      <SettingsScroll>
        <SecondaryButton label="← 返回" onPress={() => setView('main')} />
        <Section title="绑定手机号">
          <Text style={styles.hint}>账户找回与国内功能</Text>
          <Field
            label="手机号"
            value={bindPhone}
            onChangeText={onBindPhoneChange}
            placeholder="请输入 11 位手机号"
          />
          {otpHint ? <Text style={styles.hint}>{otpHint}</Text> : null}
          <View style={styles.otpRow}>
            <View style={styles.otpInputGrow}>
              <Field
                value={bindCode}
                onChangeText={setBindCode}
                placeholder="请输入验证码"
              />
            </View>
            <Pressable
              style={[
                styles.otpSendBtn,
                busy || sendingCode || !bindPhone.trim() || smsCooldown > 0
                  ? styles.otpSendBtnDisabled
                  : null,
              ]}
              disabled={busy || sendingCode || !bindPhone.trim() || smsCooldown > 0}
              onPress={() => void sendBindPhoneCode()}
            >
              <Text style={styles.otpSendBtnText}>
                {sendingCode ? '发送中…' : smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
              </Text>
            </Pressable>
          </View>
          <PrimaryButton
            label={busy ? '绑定中…' : '确认绑定'}
            onPress={() => void submitBindPhone()}
          />
        </Section>
        {message ? <Text style={styles.hint}>{message}</Text> : null}
      </SettingsScroll>
    )
  }

  if (view === 'bind_wechat') {
    return (
      <SettingsScroll>
        <SecondaryButton label="← 返回" onPress={() => setView('main')} />
        <Section title="绑定微信">
          <Text style={styles.hint}>授权后可在微信与手机号之间共用同一 Toolman 账户。</Text>
          <PrimaryButton label="打开微信授权" onPress={notifyWechatUnavailable} />
        </Section>
        {message ? <Text style={styles.hint}>{message}</Text> : null}
      </SettingsScroll>
    )
  }

  return (
    <SettingsScroll>
      <Section
        title="个人资料"
        trailing={
          <Text style={[styles.sectionTrailing, isVip ? styles.sectionTrailingVip : null]}>
            {profileRoleLabel}
          </Text>
        }
      >
        <Text style={styles.meta}>{accountLabel}</Text>
        <Field label="显示名" value={displayName} onChangeText={setDisplayName} />
        <PrimaryButton label="保存资料" onPress={() => void saveDisplayName()} />
        <ActionRow title={skuLabel} onPress={() => setView('vip')} />
        <ActionRow
          title={syncTitle}
          subtitle="打开应用时同步一次，之后约每 3 分钟检查变化；也可点此立即同步"
          disabled={syncing}
          onPress={() => void syncNow()}
        />
        <ActionRow
          title={bindPhoneTitle}
          subtitle={hasPhoneBinding ? undefined : '账户找回与国内功能'}
          disabled={hasPhoneBinding}
          onPress={openBindPhone}
        />
        <ActionRow
          title={hasWechatBinding ? '已绑定微信' : '绑定微信'}
          disabled={hasWechatBinding}
          onPress={openBindWechat}
        />
      </Section>

      <Section title="账户">
        <ActionRow title="修改密码" onPress={() => setView('password')} />
        <SecondaryButton label="退出登录" onPress={() => void logout()} />
        <Pressable style={styles.dangerBtn} onPress={() => setView('delete')}>
          <Text style={styles.dangerBtnText}>注销账户…</Text>
        </Pressable>
      </Section>

      {message ? <Text style={styles.hint}>{message}</Text> : null}
    </SettingsScroll>
  )
}

function ActionRow(props: {
  title: string
  subtitle?: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      style={[styles.actionRowCard, props.disabled ? styles.btnDisabled : null]}
      disabled={props.disabled}
      onPress={props.onPress}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.actionRowTitle}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.hint}>{props.subtitle}</Text> : null}
      </View>
      <Text style={styles.linkText}>{props.disabled ? '' : '›'}</Text>
    </Pressable>
  )
}
