import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { colors } from '../theme'
import { styles } from './GroupSettingsModal.styles'

export function GroupSettingsGeneralSection(props: {
  name: string
  description: string
  changeName: (value: string) => void
  setDescription: (value: string) => void
}) {
  return (
    <View style={styles.form}>
      <Text style={styles.sectionTitle}>常规设置</Text>
      <Text style={styles.label}>
        群组名称<Text style={styles.required}> *</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={props.name}
        onChangeText={props.changeName}
        placeholder="输入群组名称"
        placeholderTextColor={colors.textSecondary}
        maxLength={100}
      />
      <Text style={styles.label}>描述</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={props.description}
        onChangeText={props.setDescription}
        placeholder="简要描述群组用途…"
        placeholderTextColor={colors.textSecondary}
        maxLength={500}
        multiline
      />
    </View>
  )
}

export function GroupSettingsStorageSection() {
  return (
    <View style={styles.form}>
      <Text style={styles.sectionTitle}>数据底座状态</Text>
      <Text style={styles.label}>本地存储路径</Text>
      <View style={styles.pathBox}>
        <Text style={styles.pathText} numberOfLines={1}>
          本机（移动端本地存储）
        </Text>
      </View>
      <View style={styles.statGrid}>
        <StatCard label="同步状态" value="空闲" idle />
        <StatCard label="序号模式" value="—" />
        <StatCard label="复制拓扑" value="—" />
        <StatCard label="最新事件序号" value="—" mono />
        <StatCard label="上次同步时间" value="—" muted />
        <StatCard label="待同步文件" value="0" mono />
      </View>
      <Text style={styles.hint}>
        本机已知的群组事件最大序号，用于成员间同步与排序；创建群组、分享资源等操作会递增。
      </Text>
      <Text style={styles.hint}>暂无已连接的对端设备。</Text>
    </View>
  )
}

export function GroupSettingsDangerSection(props: { onRequestDissolve: () => void }) {
  return (
    <View style={styles.form}>
      <Text style={styles.sectionTitle}>危险操作</Text>
      <View style={styles.dangerCard}>
        <Text style={styles.hint}>解散后将移除本机该群组的数据。此操作不可撤销。</Text>
        <Pressable
          onPress={props.onRequestDissolve}
          style={({ pressed }) => [styles.dangerBtn, pressed ? styles.dangerBtnPressed : null]}
        >
          <Text style={styles.dangerBtnText}>解散群组</Text>
        </Pressable>
      </View>
    </View>
  )
}

export function GroupSettingsDissolveConfirm(props: {
  groupName: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <View style={styles.confirmOverlay} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={props.onCancel} accessibilityLabel="取消" />
      <View style={styles.confirmDialog}>
        <Text style={styles.confirmTitle}>解散群组</Text>
        <Text style={styles.confirmMessage}>
          确定要解散「{props.groupName}」吗？此操作不可撤销，所有成员将失去访问权限。
        </Text>
        <View style={styles.confirmActions}>
          <Pressable
            onPress={props.onCancel}
            style={({ pressed }) => [
              styles.footerBtn,
              styles.footerBtnSecondary,
              pressed ? styles.footerBtnPressed : null,
            ]}
          >
            <Text style={styles.footerBtnSecondaryText}>取消</Text>
          </Pressable>
          <Pressable
            onPress={props.onConfirm}
            style={({ pressed }) => [
              styles.footerBtn,
              styles.confirmDangerBtn,
              pressed ? styles.footerBtnPressed : null,
            ]}
          >
            <Text style={styles.confirmDangerText}>解散群组</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function StatCard(props: {
  label: string
  value: string
  idle?: boolean
  muted?: boolean
  mono?: boolean
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{props.label}</Text>
      <View style={styles.statValueRow}>
        {props.idle ? <View style={styles.statusDot} /> : null}
        <Text
          style={[
            styles.statValue,
            props.mono ? styles.statValueMono : null,
            props.muted ? styles.statValueMuted : null,
          ]}
        >
          {props.value}
        </Text>
      </View>
    </View>
  )
}


