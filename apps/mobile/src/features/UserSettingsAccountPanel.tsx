import { Pressable, Text, View } from 'react-native'
import type { MobileAuthSession } from '../auth/types'
import { useI18n } from '../i18n'
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  Section,
  SettingsScroll,
  settingsUiStyles as styles,
} from './settingsUi'
import { useLoggedInAccount } from './useUserSettingsPanel'
import { ActionRow } from './UserSettingsShared'

export function LoggedInAccountPanel(props: {
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
    syncSubtitle,
    hubToken,
    setHubToken,
    pairingCode,
    setPairingCode,
    pairingStatus,
    devicePaired,
    redeemPairing,
    clearPairing,
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
  const { t } = useI18n()

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

      <Section title={t('user.tokenSync')}>
        <Text style={styles.hint}>{t('user.transportHint')}</Text>
        <Field
          label={t('diagnostics.hubToken')}
          value={hubToken}
          onChangeText={setHubToken}
          placeholder={t('diagnostics.hubTokenPlaceholder')}
          secureTextEntry
        />
        <Text style={styles.meta}>
          {t('user.devicePairingStatus')}：{pairingStatus}
        </Text>
        {devicePaired ? (
          <Field
            label={t('user.devicePairing')}
            value={'•'.repeat(12)}
            editable={false}
          />
        ) : (
          <Field
            label={t('user.devicePairing')}
            value={pairingCode ? '•'.repeat(Math.min(pairingCode.length, 16)) : ''}
            onChangeText={(next) => {
              const capped = pairingCode ? '•'.repeat(Math.min(pairingCode.length, 16)) : ''
              if (next === capped) return
              if (!next || /^•+$/.test(next)) {
                setPairingCode('')
                return
              }
              setPairingCode(next.replace(/•/g, ''))
            }}
            placeholder={t('user.devicePairingPlaceholder')}
          />
        )}
        {!devicePaired ? (
          <PrimaryButton
            label={busy ? '…' : t('user.devicePairingRedeem')}
            onPress={() => void redeemPairing()}
          />
        ) : null}
        <SecondaryButton label={t('user.devicePairingClear')} onPress={() => void clearPairing()} />
        <ActionRow
          title={syncTitle}
          subtitle={syncSubtitle}
          disabled={syncing}
          onPress={() => void syncNow()}
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

