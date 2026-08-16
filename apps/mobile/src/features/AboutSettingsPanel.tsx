import { Image, Linking, Pressable, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { TOOLMAN_COPYRIGHT_NOTICE, TOOLMAN_SPDX_LICENSE } from '@toolman/shared'
import {
  ABOUT_LINK_ACTIONS,
  ABOUT_LINK_IDS,
  ABOUT_LINK_LABELS,
  TOOLMAN_GITHUB_URL,
} from '../settings/about'
import { SettingsScroll } from './settingsUi'
import { aboutLinkInteractive, useAboutSettingsPanel } from './useAboutSettingsPanel'
import appIcon from '../../assets/icon.png'
import { styles } from './AboutSettingsStyles'
import { OutlineButton, IconGithub, LinkRowIcon } from './AboutSettingsWidgets'
import { AboutJoinUsModal } from './AboutJoinUsModal'

const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0'

export function AboutSettingsPanel() {
  const {
    joinOpen,
    setJoinOpen,
    updateBusy,
    updateLabel,
    updateHint,
    checkUpdate,
    openLink,
  } = useAboutSettingsPanel()

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
            <Text style={styles.copyright}>{TOOLMAN_COPYRIGHT_NOTICE} · {TOOLMAN_SPDX_LICENSE}</Text>
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
          const isJoin = id === 'join'
          const interactive = aboutLinkInteractive(id)
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
