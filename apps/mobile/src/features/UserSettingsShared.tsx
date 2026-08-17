import { Pressable, Text, TextInput, View } from 'react-native'
import {
  IconApple,
  IconDouyin,
  IconGoogle,
  IconWechat,
} from '../icons/auth-social-icons'
import { colors } from '../theme'
import { settingsUiStyles as styles } from './settingsUi'
import type { SocialProvider } from './userSettingsUtils'

export function SocialProviderIcon({ id }: { id: SocialProvider }) {
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

export function AuthTextField(props: {
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

export function ActionRow(props: {
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
