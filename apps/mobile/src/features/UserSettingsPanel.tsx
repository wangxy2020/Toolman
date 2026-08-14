import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  bindPhoneToAccount,
  changePassword,
  cnPrimaryActionLabel,
  deleteAccount,
  loginWithAccount,
  logoutLocal,
  setSubscriptionSku,
  updateDisplayName,
} from '../auth/localAuth'
import { maskPhone } from '../auth/account-utils'
import {
  firebaseEmailAuth,
  firebaseOAuthLogin,
} from '../auth/firebaseAuth'
import { isMobileFirebaseConfigured } from '../auth/firebaseConfig'
import {
  loginWithAuthingPassword,
  registerWithVerificationCode,
  resetPasswordWithVerificationCode,
  sendAuthingVerificationCode,
  verifyAuthingPhoneCode,
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
type AccountView = 'main' | 'password' | 'vip' | 'delete' | 'bind_phone' | 'bind_wechat'

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
    deletedNotes,
    setDeletedNotes,
    knowledgeMeta,
    setKnowledgeMeta,
    classroomCourses,
    setClassroomCourses,
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
      onSync={async () => {
        setSyncStatus('syncing')
        try {
          await pushNoteChanges(notes, syncCursor, { deletedNotes })
          const applied = await pullAndApplySync({
            cursor: syncCursor,
            notes,
            deletedNotes,
            knowledgeMeta,
            classroomCourses,
          })
          setNotes(applied.notes)
          setDeletedNotes(applied.deletedNotes)
          setKnowledgeMeta(applied.knowledgeMeta)
          setClassroomCourses(applied.classroomCourses)
          setSyncCursor(applied.nextCursor)
          setDesktopHostsOnline(applied.hostsOnline)
          if (applied.knowledgeError) {
            setSyncStatus('error')
            return applied.knowledgeError
          }
          setSyncStatus('idle')
          return `同步完成：笔记 ${applied.notes.length} 篇，知识库 ${applied.knowledgeMeta.length} 个（${applied.documentCount} 篇文档），课程 ${applied.classroomCourses.length} 门`
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
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [otpHint, setOtpHint] = useState<string | null>(null)
  const firebaseReady = isMobileFirebaseConfigured()
  const showOtpRow = view === 'register' || view === 'forgot'
  const showConfirmPassword = view === 'register' || view === 'forgot'
  const formReady =
    Boolean(account.trim() && password.trim()) &&
    (view === 'login' || Boolean(smsCode.trim() && confirmPassword.trim()))

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
        ? '通过注册手机号或邮箱接收验证码，设置新密码。'
        : '加入我们，解锁全部功能，你的电脑将如虎添翼。'

  const primaryLabel = (() => {
    if (busy) {
      if (view === 'register') return '注册中…'
      if (view === 'forgot') return '提交中…'
      return '登录中…'
    }
    if (view === 'forgot') return '重置密码'
    if (view === 'register') return cnPrimaryActionLabel('register', account)
    return cnPrimaryActionLabel('login', account)
  })()

  const messageIsOk =
    Boolean(message) &&
    (message!.includes('已') || message!.includes('请查收') || message!.includes('邮件') || message!.includes('验证码'))

  const sendCode = async () => {
    setSendingCode(true)
    setMessage(null)
    setOtpHint(null)
    try {
      const result = await sendAuthingVerificationCode(
        account,
        view === 'forgot' ? 'reset' : 'register',
      )
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

  const resetGuestFields = () => {
    setMessage(null)
    setSmsCode('')
    setPassword('')
    setConfirmPassword('')
    setOtpHint(null)
  }

  return (
    <SettingsScroll>
      <View style={styles.authCard}>
        <Text style={styles.authTitle}>{title}</Text>
        <Text style={styles.authSubtitle}>{subtitle}</Text>

        <View style={styles.authForm}>
          <AuthTextField
            value={account}
            onChangeText={(value) => {
              setAccount(value)
              setOtpHint(null)
            }}
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
            onPress={() =>
              void run(async () => {
                if (view === 'forgot') {
                  if (password !== confirmPassword) {
                    setMessage('两次输入的密码不一致')
                    return
                  }
                  const result = await resetPasswordWithVerificationCode({
                    account,
                    code: smsCode,
                    password,
                    confirmPassword,
                  })
                  if (!result.ok) {
                    setMessage(result.message)
                    return
                  }
                  setMessage('密码已重置，请使用新密码登录。')
                  setView('login')
                  setPassword('')
                  setConfirmPassword('')
                  setSmsCode('')
                  setOtpHint(null)
                  return
                }

                if (view === 'login') {
                  const remote = await loginWithAuthingPassword({ account, password })
                  if (remote.ok) {
                    onSession(remote.session)
                    return
                  }

                  const local = await loginWithAccount({
                    account,
                    password,
                    region: 'cn',
                  })
                  if (local.ok) {
                    onSession(local.session)
                    return
                  }

                  if (account.includes('@') && firebaseReady) {
                    const firebase = await firebaseEmailAuth({
                      email: account,
                      password,
                      intent: 'login',
                    })
                    if (firebase.ok) {
                      onSession(firebase.session)
                      return
                    }
                    setMessage(remote.message === 'Authing 未配置' ? firebase.message : remote.message)
                    return
                  }

                  setMessage(
                    remote.message === 'Authing 未配置' ? local.message : remote.message,
                  )
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
                    resetGuestFields()
                  }}
                >
                  立即注册
                </Text>
              </Text>
              <Text
                style={styles.authFooterLink}
                onPress={() => {
                  setView('forgot')
                  resetGuestFields()
                }}
              >
                忘记密码？
              </Text>
            </>
          ) : view === 'register' ? (
            <Text style={styles.authFooterMuted}>
              已有账号？
              <Text
                style={styles.authFooterLink}
                onPress={() => {
                  setView('login')
                  resetGuestFields()
                }}
              >
                立即登录
              </Text>
            </Text>
          ) : (
            <Text
              style={styles.authFooterLink}
              onPress={() => {
                setView('login')
                resetGuestFields()
              }}
            >
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
  const { auth, setAuth } = props
  const [view, setView] = useState<AccountView>('main')
  const [displayName, setDisplayName] = useState(auth.displayName)
  const [bindPhone, setBindPhone] = useState('')
  const [bindCode, setBindCode] = useState('')
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)
  const [otpHint, setOtpHint] = useState<string | null>(null)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const skuLabel = auth.subscriptionSku === 'pro' ? '专业版' : '社区版'
  const accountLabel = auth.accountKind === 'phone' ? auth.phone ?? auth.email : auth.email
  const isVip = auth.communityRole === 'enterprise' || auth.subscriptionSku === 'pro'
  const hasPhoneBinding = Boolean(auth.phone)
  const hasWechatBinding = Boolean(auth.wechatBound)
  const profileRoleLabel =
    auth.communityRole === 'founder'
      ? '超级管理员'
      : auth.communityRole === 'admin'
        ? '管理员'
        : isVip
          ? 'VIP'
          : '普通用户'

  useEffect(() => {
    if (smsCooldown <= 0) return
    const timer = setTimeout(() => setSmsCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [smsCooldown])

  const sendBindPhoneCode = async () => {
    setSendingCode(true)
    setMessage(null)
    setOtpHint(null)
    try {
      const result = await sendAuthingVerificationCode(bindPhone, 'login')
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setSmsCooldown(result.retryAfterSeconds)
      setOtpHint(
        result.devHint ??
          `验证码已发送至手机，${Math.max(1, Math.round(result.expiresInSeconds / 60))} 分钟内有效。`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSendingCode(false)
    }
  }

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
            onPress={() =>
              void (async () => {
                if (newPassword !== confirmPassword) {
                  setMessage('两次输入的密码不一致')
                  return
                }
                setBusy(true)
                setMessage(null)
                try {
                  const result = await changePassword({
                    identityId: auth.identityId,
                    oldPassword,
                    newPassword,
                  })
                  setMessage(result.ok ? '密码已更新，请使用新密码登录。' : result.message)
                  if (result.ok) {
                    setOldPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
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
          <Text style={styles.hint}>注销后不可恢复，请输入密码并填写 DELETE 确认。</Text>
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

  if (view === 'bind_phone') {
    return (
      <SettingsScroll>
        <SecondaryButton label="← 返回" onPress={() => setView('main')} />
        <Section title="绑定手机号">
          <Text style={styles.hint}>账户找回与国内功能</Text>
          <Field
            label="手机号"
            value={bindPhone}
            onChangeText={(value) => {
              setBindPhone(value)
              setOtpHint(null)
            }}
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
            onPress={() =>
              void (async () => {
                if (busy) return
                setBusy(true)
                setMessage(null)
                try {
                  const verified = await verifyAuthingPhoneCode(bindPhone, bindCode)
                  if (!verified.ok) {
                    setMessage(verified.message)
                    return
                  }
                  const result = await bindPhoneToAccount({
                    identityId: auth.identityId,
                    phone: bindPhone,
                  })
                  if (!result.ok) {
                    setMessage(result.message)
                    return
                  }
                  setAuth(result.session)
                  setBindCode('')
                  setOtpHint(null)
                  setMessage('手机号已绑定')
                  setView('main')
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

  if (view === 'bind_wechat') {
    return (
      <SettingsScroll>
        <SecondaryButton label="← 返回" onPress={() => setView('main')} />
        <Section title="绑定微信">
          <Text style={styles.hint}>授权后可在微信与手机号之间共用同一 Toolman 账户。</Text>
          <PrimaryButton
            label="打开微信授权"
            onPress={() => setMessage('移动端暂未接入微信授权，请使用桌面端绑定。')}
          />
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
        <ActionRow title={skuLabel} onPress={() => setView('vip')} />
        <ActionRow
          title={
            props.syncStatus === 'idle'
              ? '已同步'
              : props.syncStatus === 'syncing'
                ? '同步中'
                : props.syncStatus === 'error'
                  ? '同步异常，点此重试'
                  : '立即同步'
          }
          subtitle="与桌面端同步笔记、知识库与课堂"
          disabled={props.syncStatus === 'syncing'}
          onPress={() =>
            void (async () => {
              setMessage(await props.onSync())
            })()
          }
        />
        <ActionRow
          title={hasPhoneBinding ? `已绑定 ${maskPhone(auth.phone!)}` : '绑定手机号'}
          subtitle={hasPhoneBinding ? undefined : '账户找回与国内功能'}
          disabled={hasPhoneBinding}
          onPress={() => {
            setBindPhone(auth.phone ?? '')
            setBindCode('')
            setOtpHint(null)
            setMessage(null)
            setView('bind_phone')
          }}
        />
        <ActionRow
          title={hasWechatBinding ? '已绑定微信' : '绑定微信'}
          disabled={hasWechatBinding}
          onPress={() => {
            setMessage(null)
            setView('bind_wechat')
          }}
        />
      </Section>

      <Section title="账户">
        <ActionRow title="修改密码" onPress={() => setView('password')} />
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
