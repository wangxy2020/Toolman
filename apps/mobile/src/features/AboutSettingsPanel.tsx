import { useState } from 'react'
import {
  Image,
  type ImageSourcePropType,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Constants from 'expo-constants'
import Svg, { Path, Polyline } from 'react-native-svg'
import {
  ABOUT_LINK_ACTIONS,
  ABOUT_LINK_IDS,
  ABOUT_LINK_LABELS,
  resolveAboutLinkUrl,
  TOOLMAN_GITHUB_URL,
  TOOLMAN_JOIN_US_QQ,
  TOOLMAN_JOIN_US_QQ_GROUP,
  type AboutLinkId,
} from '../settings/about'
import { colors } from '../theme'
import { SettingsScroll } from './settingsUi'

const appIcon = require('../../assets/icon.png') as ImageSourcePropType
const joinUsQr = require('../../assets/toolman-qq-group-qr.png') as ImageSourcePropType

const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0'

function IconGithub({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#111111"
        d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.021C22 6.484 17.522 2 12 2z"
      />
    </Svg>
  )
}

function LinkRowIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke="#b0b4bb"
        strokeWidth={1.8}
        fill="none"
      />
      <Polyline points="14 2 14 8 20 8" stroke="#b0b4bb" strokeWidth={1.8} fill="none" />
    </Svg>
  )
}

function OutlineButton(props: {
  label: string
  onPress?: () => void
  disabled?: boolean
  accent?: boolean
  small?: boolean
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled || !props.onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.outlineBtn,
        props.small ? styles.outlineBtnSm : null,
        props.accent ? styles.outlineBtnAccent : null,
        props.disabled || !props.onPress ? styles.outlineBtnDisabled : null,
        pressed && !props.disabled && props.onPress
          ? props.accent
            ? styles.outlineBtnAccentPressed
            : styles.outlineBtnPressed
          : null,
      ]}
    >
      <Text
        style={[
          styles.outlineBtnText,
          props.small ? styles.outlineBtnTextSm : null,
          props.accent ? styles.outlineBtnTextAccent : null,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  )
}

export function AboutSettingsPanel() {
  const [joinOpen, setJoinOpen] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateLabel, setUpdateLabel] = useState('检查更新')
  const [updateHint, setUpdateHint] = useState<string | null>(null)

  const checkUpdate = () => {
    if (updateBusy) return
    setUpdateBusy(true)
    setUpdateLabel('检查中…')
    setUpdateHint('正在检查更新…')
    setTimeout(() => {
      setUpdateBusy(false)
      setUpdateLabel('已是最新')
      setUpdateHint('当前已是最新版本。')
    }, 500)
  }

  const openLink = (id: AboutLinkId) => {
    if (id === 'join') {
      setJoinOpen(true)
      return
    }
    const url = resolveAboutLinkUrl(id)
    if (url) void Linking.openURL(url)
  }

  return (
    <SettingsScroll>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>关于我们</Text>
          <Pressable
            onPress={() => void Linking.openURL(TOOLMAN_GITHUB_URL)}
            accessibilityLabel="在 GitHub 打开 Toolman 仓库"
            hitSlop={6}
            style={({ pressed }) => [styles.githubBtn, pressed ? styles.githubBtnPressed : null]}
          >
            <IconGithub size={24} />
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Image
            source={appIcon}
            style={styles.logo}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.heroText}>
            <Text style={styles.name}>Toolman</Text>
            <Text style={styles.tagline}>一款为创造者而生的 AI 助手</Text>
            <Text style={styles.versionBadge}>v{APP_VERSION}</Text>
          </View>
          <OutlineButton label={updateLabel} onPress={checkUpdate} disabled={updateBusy} />
        </View>

        {updateHint ? <Text style={styles.updateHint}>{updateHint}</Text> : null}

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>自动更新</Text>
          <View style={styles.switchTrack}>
            <View style={styles.switchThumb} />
          </View>
        </View>
        <Text style={styles.autoUpdateHint}>
          移动端请通过应用商店更新，应用内自动更新不可用。
        </Text>
      </View>

      <View style={[styles.card, styles.linksCard]}>
        {ABOUT_LINK_IDS.map((id, index) => {
          const externalUrl = resolveAboutLinkUrl(id)
          const isJoin = id === 'join'
          const interactive = isJoin || Boolean(externalUrl)
          return (
            <View key={id} style={[styles.linkRow, index > 0 ? styles.linkRowBorder : null]}>
              <View style={styles.linkLabel}>
                <View style={styles.linkIcon}>
                  <LinkRowIcon />
                </View>
                <Text style={styles.linkLabelText} numberOfLines={1}>
                  {ABOUT_LINK_LABELS[id]}
                </Text>
              </View>
              <OutlineButton
                small
                accent={isJoin}
                label={ABOUT_LINK_ACTIONS[id]}
                disabled={!interactive}
                onPress={interactive ? () => openLink(id) : undefined}
              />
            </View>
          )
        })}
      </View>

      <AboutJoinUsModal visible={joinOpen} onClose={() => setJoinOpen(false)} />
    </SettingsScroll>
  )
}

function AboutJoinUsModal(props: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} accessibilityLabel="关闭" />
        <View style={styles.modalDialog} onStartShouldSetResponder={() => true}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>加入我们</Text>
            <Pressable onPress={props.onClose} accessibilityLabel="关闭" hitSlop={8} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            <View style={styles.qrWrap}>
              <Image
                source={joinUsQr}
                style={styles.qrImage}
                resizeMode="contain"
                accessibilityLabel="Toolman QQ 群二维码"
              />
            </View>
            <Text style={styles.joinWelcome}>欢迎加入Toolman创造者社区！</Text>
            <Text style={styles.joinWelcome}>
              QQ群：{TOOLMAN_JOIN_US_QQ_GROUP}，QQ：{TOOLMAN_JOIN_US_QQ}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  githubBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  githubBtnPressed: {
    backgroundColor: colors.hover,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    marginBottom: 4,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  tagline: {
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  versionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.accentSoft,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '500',
    overflow: 'hidden',
  },
  updateHint: {
    marginTop: 0,
    marginHorizontal: 18,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginHorizontal: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  toggleLabel: {
    fontSize: 14,
    color: colors.text,
  },
  switchTrack: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#d7dbe0',
    padding: 2,
    justifyContent: 'center',
    opacity: 0.55,
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  autoUpdateHint: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  linksCard: {
    paddingVertical: 4,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  linkRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  linkLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  linkIcon: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkLabelText: {
    flexShrink: 1,
    fontSize: 14,
    color: colors.text,
  },
  outlineBtn: {
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bg,
  },
  outlineBtnSm: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  outlineBtnAccent: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  outlineBtnPressed: {
    backgroundColor: colors.hover,
  },
  outlineBtnAccentPressed: {
    backgroundColor: colors.accentHover,
    borderColor: colors.accentHover,
  },
  outlineBtnDisabled: {
    opacity: 0.55,
  },
  outlineBtnText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  outlineBtnTextSm: {
    fontSize: 12,
  },
  outlineBtnTextAccent: {
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalDialog: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  modalClose: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: 'center',
  },
  qrWrap: {
    marginBottom: 14,
    alignItems: 'center',
  },
  qrImage: {
    width: 240,
    height: 320,
    borderRadius: 12,
  },
  joinWelcome: {
    fontSize: 14,
    lineHeight: 24,
    color: colors.textSecondary,
    textAlign: 'center',
  },
})
