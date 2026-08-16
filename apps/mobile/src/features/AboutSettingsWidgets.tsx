import {
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Constants from 'expo-constants'
import Svg, { Path, Polyline } from 'react-native-svg'
import { TOOLMAN_COPYRIGHT_NOTICE, TOOLMAN_SPDX_LICENSE } from '@toolman/shared'
import {
  ABOUT_LINK_ACTIONS,
  ABOUT_LINK_IDS,
  ABOUT_LINK_LABELS,
  TOOLMAN_GITHUB_URL,
  TOOLMAN_JOIN_US_QQ,
  TOOLMAN_JOIN_US_QQ_GROUP,
} from '../settings/about'
import { colors } from '../theme'
import { SettingsScroll } from './settingsUi'
import { aboutLinkInteractive, useAboutSettingsPanel } from './useAboutSettingsPanel'
import appIcon from '../../assets/icon.png'
import joinUsQr from '../../assets/toolman-qq-group-qr.png'
import { styles } from './AboutSettingsStyles'

const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0'

export function IconGithub({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#111111"
        d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.021C22 6.484 17.522 2 12 2z"
      />
    </Svg>
  )
}

export function LinkRowIcon() {
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

export function OutlineButton(props: {
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

