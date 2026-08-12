import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  changePassword,
  cnPrimaryActionLabel,
  deleteAccount,
  isCnEmailAccountInput,
  loginWithAccount,
  logoutLocal,
  resetPasswordWithAccount,
  setSubscriptionSku,
  updateDisplayName,
} from '../auth/localAuth'
import {
  firebaseEmailAuth,
  firebaseOAuthLogin,
  firebaseSendPasswordReset,
} from '../auth/firebaseAuth'
import { isMobileFirebaseConfigured } from '../auth/firebaseConfig'
import {
  registerWithVerificationCode,
  sendRegisterVerificationCode,
} from '../auth/authingOtp'
import type { MobileAuthSession } from '../auth/types'
import {
  IconApple,
  IconDouyin,
  IconGoogle,
  IconWechat,
} from '../icons/auth-social-icons'
import { colors } from '../theme'
import { pullAndApplySync, pushNoteChanges } from '../sync/mobileSync'
import { useMobileApp } from '../state/MobileAppContext'
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  Section,
  SettingsScroll,
  settingsUiStyles as styles,
} from './settingsUi'

type SocialProvider = 'wechat' | 'douyin' | 'google' | 'apple'

const SOCIAL_ITEMS: Array<{
  id: SocialProvider
  label: string
  enabled: boolean
}> = [
  { id: 'wechat', label: '微信', enabled: false },
  { id: 'douyin', label: '抖音', enabled: false },
  { id: 'google', label: 'Google', enabled: true },
  { id: 'apple', label: 'Apple', enabled: true },
]

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

type GuestView = 'login' | 'register' | 'forgot'
type AccountView = 'main' | 'password' | 'vip' | 'delete'

export function UserSettingsPanel() {
  const {
    auth,
    setAuth,
    syncCursor,
    setSyncCursor,
    setSyncStatus,
    setDesktopHostsOnline,
    notes,
    setNotes,
    knowledgeMeta,
    setKnowledgeMeta,
    desktopHostsOnline,
    syncStatus,
  } = useMobileApp()

  if (!auth) {
    return <GuestAuthPanel onSession={setAuth} />
  }

  return (
    <LoggedInAccountPanel
      auth={auth}
      setAuth={setAuth}
      syncStatus={syncStatus}
      desktopHostsOnline={desktopHostsOnline}
      onSync={async () => {
        setSyncStatus('syncing')
        try {
          await pushNoteChanges(notes, syncCursor)
          const applied = await pullAndApplySync({ cursor: syncCursor, notes, knowledgeMeta })
          setNotes(applied.notes)
          setKnowledgeMeta(applied.knowledgeMeta)
          setSyncCursor(applied.nextCursor)
          setDesktopHostsOnline(applied.hostsOnline)
          setSyncStatus('idle')
          return '同步完成'
        } catch (error) {
          setSyncStatus('error')
          return error instanceof Error ? error.message : String(error)
        }
      }}
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
  const [view, setView] = useState<GuestView>('login')
  const [account, setAccount] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [otpHint, setOtpHint] = useState<string | null>(null)
  const firebaseReady = isMobileFirebaseConfigured()
  const accountIsEmail = isCnEmailAccountInput(account)

  useEffect(() => {
    if (smsCooldown <= 0) return
    const timer = setTimeout(() => setSmsCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [smsCooldown])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const title =
    view === 'register'
      ? '注册 Toolman 账户'
      : view === 'forgot'
        ? '找回密码'
        : '登录 Toolman 账户'

  const subtitle =
    view === 'register'
      ? '使用手机号或邮箱注册，验证码验证后即可完成。'
      : view === 'forgot'
        ? accountIsEmail || !account.trim()
          ? '输入注册邮箱，我们将发送密码重置链接；手机号可直接设置新密码。'
          : '输入注册手机号，设置新密码。'
        : '加入我们，解锁全部功能，你的电脑将如虎添翼。'

  const accountPlaceholder =
    view === 'forgot' ? '请输入注册手机或邮箱' : '请输入手机或邮箱'

  const primaryLabel = (() => {
    if (busy) {
      if (view === 'register') return '注册中…'
      if (view === 'forgot') return accountIsEmail ? '发送中…' : '提交中…'
      return '登录中…'
    }
    if (view === 'forgot') return accountIsEmail ? '发送重置邮件' : '重置密码'
    if (view === 'register') return cnPrimaryActionLabel('register', account)
    return cnPrimaryActionLabel('login', account)
  })()

  const showPasswordFields = view !== 'forgot' || !accountIsEmail
  const showConfirmPassword =
    view === 'register' || (view === 'forgot' && !accountIsEmail && Boolean(account.trim()))
  const messageIsOk =
    Boolean(message) &&
    (message!.includes('已') || message!.includes('请查收') || message!.includes('邮件') || message!.includes('验证码'))

  const sendCode = async () => {
    setSendingCode(true)
    setMessage(null)
    setOtpHint(null)
    try {
      const result = await sendRegisterVerificationCode(account)
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setSmsCooldown(result.retryAfterSeconds)
      setOtpHint(
        result.devHint ??
          `验证码已发送至${result.channel === 'email' ? '邮箱' : '手机'}，${Math.max(1, Math.round(result.expiresInSeconds / 60))} 分钟内有效。`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSendingCode(false)
    }
  }

  return (
    <SettingsScroll>
      <View style={styles.authCard}>
        <Text style={styles.authTitle}>{title}</Text>
        <Text style={styles.authSubtitle}>{subtitle}</Text>

        <View style={styles.authForm}>
          {view === 'register' ? (
            <AuthTextField
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="怎么称呼你（可选）"
            />
          ) : null}

          <AuthTextField
            value={account}
            onChangeText={(value) => {
              setAccount(value)
              if (view === 'register') {
                setOtpHint(null)
              }
            }}
            placeholder={accountPlaceholder}
          />

          {view === 'register' ? (
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

          {showPasswordFields ? (
            <AuthTextField
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder={view === 'forgot' ? '请输入新密码' : '请输入密码'}
            />
          ) : (
            <Text style={styles.authInlineHint}>我们将向该邮箱发送 Firebase 密码重置链接…</Text>
          )}

          {showConfirmPassword ? (
            <AuthTextField
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="请再次输入密码"
            />
          ) : null}

          <Pressable
            style={[styles.authSubmit, busy ? styles.btnDisabled : null]}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                if (view === 'forgot') {
                  if (accountIsEmail) {
                    if (!firebaseReady) {
                      setMessage('国际登录未配置')
                      return
                    }
                    const result = await firebaseSendPasswordReset(account)
                    if (!result.ok) {
                      setMessage(result.message)
                      return
                    }
                    setMessage('密码重置邮件已发送，请查收邮箱并完成重置。')
                    return
                  }
                  const result = await resetPasswordWithAccount({
                    account,
                    newPassword: password,
                    confirmPassword,
                    region: 'cn',
                  })
                  if (!result.ok) {
                    setMessage(result.message)
                    return
                  }
                  setMessage('密码已重置，请使用新密码登录。')
                  setView('login')
                  setPassword('')
                  setConfirmPassword('')
                  return
                }

                if (view === 'login') {
                  if (accountIsEmail && firebaseReady) {
                    const result = await firebaseEmailAuth({
                      email: account,
                      password,
                      intent: 'login',
                    })
                    if (!result.ok) {
                      const local = await loginWithAccount({
                        account,
                        password,
                        region: 'cn',
                      })
                      if (local.ok) {
                        onSession(local.session)
                        return
                      }
                      setMessage(result.message)
                      return
                    }
                    onSession(result.session)
                    return
                  }
                  const result = await loginWithAccount({
                    account,
                    password,
                    region: 'cn',
                  })
                  if (!result.ok) {
                    setMessage(result.message)
                    return
                  }
                  onSession(result.session)
                  return
                }

                if (password !== confirmPassword) {
                  setMessage('两次输入的密码不一致')
                  return
                }
                if (!smsCode.trim()) {
                  setMessage('请输入验证码')
                  return
                }

                const result = await registerWithVerificationCode({
                  account,
                  code: smsCode,
                  password,
                  confirmPassword,
                  displayName,
                })
                if (!result.ok) {
                  setMessage(result.message)
                  return
                }
                onSession(result.session)
              })
            }
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
                    void run(async () => {
                      if (!firebaseReady) {
                        setMessage('国际登录未配置')
                        return
                      }
                      const result = await firebaseOAuthLogin(
                        item.id === 'apple' ? 'firebase_apple' : 'firebase_google',
                      )
                      if (!result.ok) {
                        setMessage(result.message)
                        return
                      }
                      onSession(result.session)
                    })
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
                <Text
                  style={styles.authFooterLink}
                  onPress={() => {
                    setView('register')
                    setMessage(null)
                    setSmsCode('')
                    setOtpHint(null)
                  }}
                >
                  立即注册
                </Text>
              </Text>
              <Text
                style={styles.authFooterLink}
                onPress={() => {
                  setView('forgot')
                  setMessage(null)
                  setPassword('')
                  setConfirmPassword('')
                  setSmsCode('')
                  setOtpHint(null)
                }}
              >
                忘记密码？
              </Text>
            </>
          ) : (
            <Text style={styles.authFooterMuted}>
              已有账号？
              <Text
                style={styles.authFooterLink}
                onPress={() => {
                  setView('login')
                  setMessage(null)
                  setConfirmPassword('')
                  setSmsCode('')
                  setOtpHint(null)
                }}
              >
                立即登录
              </Text>
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
  desktopHostsOnline: number
  onSync: () => Promise<string>
}) {
  const { auth, setAuth } = props
  const [view, setView] = useState<AccountView>('main')
  const [displayName, setDisplayName] = useState(auth.displayName)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const skuLabel = auth.subscriptionSku === 'pro' ? '专业版' : '社区版'
  const accountLabel = auth.accountKind === 'phone' ? auth.phone ?? auth.email : auth.email

  if (view === 'password') {
    return (
      <SettingsScroll>
        <SecondaryButton label="← 返回" onPress={() => setView('main')} />
        <Section title="修改密码">
          <Field label="当前密码" value={oldPassword} onChangeText={setOldPassword} secureTextEntry />
          <Field label="新密码" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
          <PrimaryButton
            label={busy ? '保存中…' : '保存新密码'}
            onPress={() =>
              void (async () => {
                setBusy(true)
                setMessage(null)
                try {
                  const result = await changePassword({
                    identityId: auth.identityId,
                    oldPassword,
                    newPassword,
                  })
                  setMessage(result.ok ? '密码已更新' : result.message)
                  if (result.ok) {
                    setOldPassword('')
                    setNewPassword('')
                    setView('main')
                  }
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : String(error))
                } finally {
                  setBusy(false)
                }
              })()
            }
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
          <Text style={styles.hint}>
            专业版可解锁更大群组等权益。移动端正式支付即将接入；当前可先体验权益开关。
          </Text>
          {auth.subscriptionSku !== 'pro' ? (
            <PrimaryButton
              label="开通专业版"
              onPress={() =>
                void (async () => {
                  const result = await setSubscriptionSku({
                    identityId: auth.identityId,
                    sku: 'pro',
                  })
                  if (!result.ok) {
                    setMessage(result.message)
                    return
                  }
                  setAuth(result.session)
                  setMessage('已开通专业版')
                  setView('main')
                })()
              }
            />
          ) : (
            <SecondaryButton
              label="恢复社区版"
              onPress={() =>
                void (async () => {
                  const result = await setSubscriptionSku({
                    identityId: auth.identityId,
                    sku: 'community',
                  })
                  if (!result.ok) {
                    setMessage(result.message)
                    return
                  }
                  setAuth(result.session)
                  setMessage('已恢复社区版')
                  setView('main')
                })()
              }
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
          <Text style={styles.hint}>
            注销后将删除本机账户数据并退出登录，此操作不可恢复。请输入登录密码，并在下方填写 DELETE
            确认。
          </Text>
          <Field
            label="登录密码"
            value={deletePassword}
            onChangeText={setDeletePassword}
            secureTextEntry
          />
          <Field label="输入 DELETE 确认" value={deleteConfirm} onChangeText={setDeleteConfirm} />
          <Pressable
            style={styles.dangerBtn}
            onPress={() =>
              void (async () => {
                setMessage(null)
                try {
                  const result = await deleteAccount({
                    identityId: auth.identityId,
                    password: deletePassword,
                    confirmation: deleteConfirm,
                  })
                  if (!result.ok) {
                    setMessage(result.message)
                    return
                  }
                  setAuth(null)
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : String(error))
                }
              })()
            }
          >
            <Text style={styles.dangerBtnText}>确认注销</Text>
          </Pressable>
        </Section>
        {message ? <Text style={[styles.hint, styles.hintError]}>{message}</Text> : null}
      </SettingsScroll>
    )
  }

  return (
    <SettingsScroll>
      <Section title="个人资料">
        <Text style={styles.meta}>
          {auth.displayName} · {skuLabel} · 已登录
        </Text>
        <Text style={styles.hint}>
          {accountLabel} · {auth.region === 'cn' ? '国内' : '国际'}
        </Text>
        <Field label="显示名" value={displayName} onChangeText={setDisplayName} />
        <PrimaryButton
          label="保存资料"
          onPress={() =>
            void (async () => {
              setMessage(null)
              try {
                const result = await updateDisplayName({
                  identityId: auth.identityId,
                  displayName,
                })
                if (!result.ok) {
                  setMessage(result.message)
                  return
                }
                setAuth(result.session)
                setMessage('资料已保存')
              } catch (error) {
                setMessage(error instanceof Error ? error.message : String(error))
              }
            })()
          }
        />
      </Section>

      <Section title="会员">
        <ActionRow
          title={`当前方案：${skuLabel}`}
          subtitle="升级专业版 / 管理会员"
          onPress={() => setView('vip')}
        />
      </Section>

      <Section title="安全">
        <ActionRow title="修改密码" subtitle="更新登录密码" onPress={() => setView('password')} />
        <ActionRow
          title="绑定手机"
          subtitle={auth.phone ? `已绑定 ${auth.phone}` : '即将支持短信绑定'}
          disabled
          onPress={() => undefined}
        />
        <ActionRow title="绑定微信" subtitle="即将支持" disabled onPress={() => undefined} />
      </Section>

      <Section title="同步">
        <Text style={styles.meta}>
          状态：{syncStatusLabel(props.syncStatus)}
          {props.desktopHostsOnline > 0
            ? ` · 桌面宿主 ${props.desktopHostsOnline}`
            : ' · 无桌面宿主'}
        </Text>
        <SecondaryButton
          label="立即同步"
          onPress={() =>
            void (async () => {
              setMessage(await props.onSync())
            })()
          }
        />
      </Section>

      <Section title="账户操作">
        <SecondaryButton
          label="退出登录"
          onPress={() =>
            void (async () => {
              await logoutLocal()
              setAuth(null)
            })()
          }
        />
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

function syncStatusLabel(status: string): string {
  switch (status) {
    case 'syncing':
      return '同步中'
    case 'error':
      return '同步异常'
    case 'offline':
      return '离线'
    default:
      return '已同步'
  }
}
