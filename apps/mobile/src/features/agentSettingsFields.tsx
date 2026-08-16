import { type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { agentSettingsModalStyles as styles } from './agentSettingsModalStyles'

export function FieldRow(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{props.label}</Text>
        {props.hint ? <Text style={styles.hintInline}>{props.hint}</Text> : null}
      </View>
      {props.children}
    </View>
  )
}

export function ToggleRow(props: {
  label: string
  hint?: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <Pressable onPress={() => props.onChange(!props.value)} style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={styles.toggleLabel}>{props.label}</Text>
        {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
      </View>
      <View style={[styles.switchTrack, props.value ? styles.switchTrackOn : null]}>
        <View style={[styles.switchThumb, props.value ? styles.switchThumbOn : null]} />
      </View>
    </Pressable>
  )
}

export function ChoiceList(props: {
  value: string
  options: Array<{ id: string; label: string }>
  onChange: (id: string) => void
}) {
  return (
    <View style={styles.choiceList}>
      {props.options.map((option) => {
        const active = option.id === props.value
        return (
          <Pressable
            key={option.id}
            onPress={() => props.onChange(option.id)}
            style={[styles.choiceRow, active ? styles.choiceRowActive : null]}
          >
            <Text style={[styles.choiceText, active ? styles.choiceTextActive : null]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
