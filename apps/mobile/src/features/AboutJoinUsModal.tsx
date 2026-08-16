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

const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0'

import { styles } from './AboutSettingsStyles'
import { IconGithub, LinkRowIcon } from './AboutSettingsWidgets'

export function AboutJoinUsModal(props: { visible: boolean; onClose: () => void }) {
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

