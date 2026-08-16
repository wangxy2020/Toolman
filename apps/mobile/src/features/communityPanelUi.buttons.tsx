import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { IconPlus, IconRefresh } from '../icons/composer-icons'
import { colors } from '../theme'
import { uiStyles } from './communityPanelUi.styles'

export function CommunityPanelHeader(props: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <View style={uiStyles.panelHeader}>
      <View style={uiStyles.panelHeaderText}>
        <Text style={uiStyles.panelTitle}>{props.title}</Text>
        <Text style={uiStyles.panelSubtitle}>{props.subtitle}</Text>
      </View>
      {props.actions ? <View style={uiStyles.panelActions}>{props.actions}</View> : null}
    </View>
  )
}

export function CommunityPublishButton(props: {
  label: string
  disabled?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      disabled={props.disabled || !props.onPress}
      onPress={props.onPress}
      style={({ pressed }) => [
        uiStyles.publishBtn,
        (props.disabled || !props.onPress) && uiStyles.btnDisabled,
        pressed && !props.disabled ? uiStyles.publishBtnPressed : null,
      ]}
      accessibilityLabel={props.label}
    >
      <IconPlus size={14} color={colors.accent} />
      <Text style={uiStyles.publishBtnText}>{props.label}</Text>
    </Pressable>
  )
}

export function CommunitySecondaryButton(props: {
  label: string
  disabled?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        uiStyles.secondaryBtn,
        props.disabled && uiStyles.btnDisabled,
        pressed && !props.disabled ? uiStyles.secondaryBtnPressed : null,
      ]}
      accessibilityLabel={props.label}
    >
      <Text style={uiStyles.secondaryBtnText}>{props.label}</Text>
    </Pressable>
  )
}

export function CommunityRefreshButton(props: {
  loading?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      disabled={props.disabled || props.loading}
      onPress={props.onPress}
      style={({ pressed }) => [
        uiStyles.iconBtn,
        (props.disabled || props.loading) && uiStyles.btnDisabled,
        pressed ? uiStyles.iconBtnPressed : null,
      ]}
      accessibilityLabel="刷新"
    >
      {props.loading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <IconRefresh size={16} color={colors.textSecondary} />
      )}
    </Pressable>
  )
}

