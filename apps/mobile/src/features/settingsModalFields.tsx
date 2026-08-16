import { Pressable, Text, TextInput, View } from 'react-native'
import { colors } from '../theme'
import { fieldStyles } from './settingsModalFields.styles'
export { fieldStyles } from './settingsModalFields.styles'
export { SettingsRangeSlider } from './settingsModalFields.slider'

export function SettingsSectionTitle(props: { children: string }) {
  return <Text style={fieldStyles.sectionTitle}>{props.children}</Text>
}

export function SettingsInfoRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={fieldStyles.infoRow}>
      <Text style={fieldStyles.infoLabel}>{props.label}</Text>
      <Text style={[fieldStyles.infoValue, props.mono ? fieldStyles.mono : null]} selectable>
        {props.value || '—'}
      </Text>
    </View>
  )
}

export function SettingsTextArea(props: {
  label?: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  editable?: boolean
  hint?: string
  minHeight?: number
}) {
  const minHeight = props.minHeight ?? 88
  const editable = props.editable !== false
  return (
    <View style={fieldStyles.block}>
      {props.label ? <Text style={fieldStyles.label}>{props.label}</Text> : null}
      <View
        style={[
          fieldStyles.textareaBox,
          { minHeight, height: minHeight },
          editable ? null : fieldStyles.textareaBoxReadonly,
        ]}
      >
        <TextInput
          style={[fieldStyles.textareaInput, { minHeight: minHeight - 16 }]}
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder={props.placeholder}
          placeholderTextColor={colors.textSecondary}
          editable={editable}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {props.hint ? <Text style={fieldStyles.hint}>{props.hint}</Text> : null}
    </View>
  )
}

/** Desktop `.tm-notes-settings-inline-btn`. */
export function SettingsInlineButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [fieldStyles.inlineBtn, pressed ? fieldStyles.inlineBtnPressed : null]}
    >
      <Text style={fieldStyles.inlineBtnText}>{props.label}</Text>
    </Pressable>
  )
}

export function SettingsChoiceRow(props: {
  value: string
  options: Array<{ id: string; label: string }>
  onChange: (id: string) => void
}) {
  return (
    <View style={fieldStyles.choiceList}>
      {props.options.map((option) => {
        const active = option.id === props.value
        return (
          <Pressable
            key={option.id}
            onPress={() => props.onChange(option.id)}
            style={[fieldStyles.choice, active ? fieldStyles.choiceActive : null]}
          >
            <Text style={[fieldStyles.choiceText, active ? fieldStyles.choiceTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
