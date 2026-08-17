import type { ReactNode } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { colors } from '../theme'
import { settingsUiAuthStyles } from './settingsUiAuthStyles'
import { settingsUiControlStyles } from './settingsUiControlStyles'
import { settingsUiLayoutStyles } from './settingsUiLayoutStyles'

export const settingsUiStyles = {
  ...settingsUiLayoutStyles,
  ...settingsUiAuthStyles,
  ...settingsUiControlStyles,
}

export function SettingsScroll(props: { children: ReactNode }) {
  return (
    <ScrollView
      style={settingsUiStyles.rightRoot}
      contentContainerStyle={settingsUiStyles.scroll}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
    >
      {props.children}
    </ScrollView>
  )
}

export function Section(props: { title: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <View style={settingsUiStyles.card}>
      <View style={settingsUiStyles.sectionHeader}>
        <Text style={settingsUiStyles.sectionTitle}>{props.title}</Text>
        {props.trailing}
      </View>
      <View style={settingsUiStyles.sectionBody}>{props.children}</View>
    </View>
  )
}

export function Field(props: {
  label?: string
  value: string
  onChangeText?: (value: string) => void
  secureTextEntry?: boolean
  placeholder?: string
  editable?: boolean
  maxLength?: number
  keyboardType?: 'default' | 'numeric' | 'number-pad' | 'decimal-pad' | 'url'
  right?: ReactNode
}) {
  const editable = props.editable !== false
  const wrapped = Boolean(props.right)
  return (
    <View style={settingsUiStyles.field}>
      {props.label ? <Text style={settingsUiStyles.label}>{props.label}</Text> : null}
      <View style={wrapped ? settingsUiStyles.inputRow : undefined}>
        <TextInput
          style={[
            settingsUiStyles.input,
            editable ? null : settingsUiStyles.inputReadonly,
            wrapped ? settingsUiStyles.inputInRow : null,
          ]}
          value={props.value}
          onChangeText={props.onChangeText}
          secureTextEntry={props.secureTextEntry}
          placeholder={props.placeholder}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
          keyboardType={props.keyboardType}
          maxLength={props.maxLength}
          underlineColorAndroid="transparent"
        />
        {props.right}
      </View>
    </View>
  )
}

export function Toggle(props: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <Pressable
      style={[settingsUiStyles.toggle, props.value ? settingsUiStyles.toggleOn : null]}
      onPress={() => props.onChange(!props.value)}
    >
      <Text
        style={[
          settingsUiStyles.toggleLabel,
          props.value ? settingsUiStyles.toggleLabelOn : null,
        ]}
      >
        {props.label}
      </Text>
      <View
        style={[settingsUiStyles.switchTrack, props.value ? settingsUiStyles.switchTrackOn : null]}
      >
        <View
          style={[
            settingsUiStyles.switchThumb,
            props.value ? settingsUiStyles.switchThumbOn : null,
          ]}
        />
      </View>
    </Pressable>
  )
}

export function PrimaryButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable style={settingsUiStyles.btn} onPress={props.onPress}>
      <Text style={settingsUiStyles.btnText}>{props.label}</Text>
    </Pressable>
  )
}

export function SecondaryButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable style={settingsUiStyles.btnSecondary} onPress={props.onPress}>
      <Text style={settingsUiStyles.btnSecondaryText}>{props.label}</Text>
    </Pressable>
  )
}

/** Compact header control (desktop `.tm-mcp-add-btn` / reset). */
export function HeaderAction(props: {
  label: string
  onPress: () => void
  tone?: 'accent' | 'muted'
  icon?: ReactNode
}) {
  const accent = props.tone !== 'muted'
  return (
    <Pressable
      onPress={props.onPress}
      hitSlop={6}
      style={({ pressed }) => [
        settingsUiStyles.headerAction,
        pressed
          ? accent
            ? settingsUiStyles.headerActionPressedAccent
            : settingsUiStyles.headerActionPressed
          : null,
      ]}
    >
      {props.icon}
      <Text
        style={[
          settingsUiStyles.headerActionLabel,
          accent ? settingsUiStyles.headerActionLabelAccent : null,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  )
}
